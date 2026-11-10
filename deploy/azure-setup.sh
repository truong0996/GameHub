#!/usr/bin/env bash
# Dựng hạ tầng Azure cho hub — chạy MỘT lần (chạy lại cũng không sao). Sau đó GitHub Actions tự deploy app.
#   az login                 (đúng subscription; nếu có nhiều: az account set -s <id>)
#   bash deploy/azure-setup.sh
# Tạo: resource group, storage account + file share "hubdata" (thư mục data/ của server),
# Container Apps environment (gói consumption, không Log Analytics để khỏi tốn tiền),
# managed identity cho GitHub Actions đăng nhập bằng OIDC (không cần mật khẩu, không cần quyền tạo app registration).
# Container App thì CI tạo/cập nhật từ deploy/containerapp.yaml.
set -euo pipefail
# az trên Windows (Git Bash) in xuống dòng CRLF → giá trị lấy bằng $(az ...) dính '\r'. Bỏ đi.
az() { command az "$@" | tr -d '\r'; }

LOC=${LOC:-australiaeast}            # policy công ty (mg-EML) chỉ cho phép australiaeast
COST=${COST:-33500}                  # tag EmlCostCenter bắt buộc trên resource group (giá trị cho tài nguyên tự học, theo Confluence "ACE - Azure Portal Self-Learning")
RG=${RG:-rg-celestials-hub}
ENVN=${ENVN:-cae-celestials-hub}
IDN=${IDN:-id-celestials-hub-deploy}
REPO=${REPO:-truong0996/GameHub}
SHARE=hubdata
SUB=$(az account show --query id -o tsv)
TENANT=$(az account show --query tenantId -o tsv)
ST=${ST:-celestialshub${SUB:0:6}}     # tên storage phải duy nhất toàn Azure

echo "== Subscription: $(az account show --query name -o tsv) ($SUB)"
az extension add --name containerapp --upgrade --only-show-errors -y

echo "== Resource group $RG ($LOC)"
az group create -n "$RG" -l "$LOC" --tags EmlCostCenter="$COST" app=celestials-hub -o none

echo "== Storage $ST / share $SHARE"
az storage account create -g "$RG" -n "$ST" -l "$LOC" --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --https-only true --allow-blob-public-access false -o none
KEY=$(az storage account keys list -g "$RG" -n "$ST" --query '[0].value' -o tsv)
az storage share-rm create -g "$RG" --storage-account "$ST" -n "$SHARE" --quota 1 -o none

# Lần đầu: chép data/ ở máy này (tài khoản, lịch sử ván, ví) lên share. Share đã có file thì bỏ qua.
if [ "${UPLOAD_DATA:-1}" = 1 ] && [ -d data ]; then
  n=$(az storage file list --account-name "$ST" --account-key "$KEY" -s "$SHARE" --query 'length(@)' -o tsv)
  if [ "$n" = 0 ]; then
    echo "== Upload data/ → $SHARE"
    az storage file upload-batch --account-name "$ST" --account-key "$KEY" -d "$SHARE" -s data \
      --pattern '*.json*' --no-progress -o none
  else
    echo "== Share đã có $n file — không ghi đè"
  fi
fi

echo "== Container Apps environment $ENVN"
if ! az containerapp env show -g "$RG" -n "$ENVN" -o none 2>/dev/null; then
  az containerapp env create -g "$RG" -n "$ENVN" -l "$LOC" --logs-destination none -o none
fi
az containerapp env storage set -g "$RG" -n "$ENVN" --storage-name "$SHARE" \
  --azure-file-account-name "$ST" --azure-file-account-key "$KEY" \
  --azure-file-share-name "$SHARE" --access-mode ReadWrite -o none

echo "== Managed identity $IDN cho GitHub Actions ($REPO, nhánh main)"
az identity create -g "$RG" -n "$IDN" -l "$LOC" -o none
CLIENT=$(az identity show -g "$RG" -n "$IDN" --query clientId -o tsv)
PRINCIPAL=$(az identity show -g "$RG" -n "$IDN" --query principalId -o tsv)
# Token OIDC của GitHub ghi chủ + repo kèm mã số cố định: repo:<chủ>@<id chủ>/<repo>@<id repo>:ref:refs/heads/main
# (cần gh đã đăng nhập; hoặc đặt sẵn SUBJECT=...).
if [ -z "${SUBJECT:-}" ]; then
  IDS=$(gh api "repos/$REPO" --jq '"\(.owner.id) \(.id)"' | tr -d '\r')
  SUBJECT="repo:${REPO%/*}@${IDS% *}/${REPO#*/}@${IDS#* }:ref:refs/heads/main"
fi
echo "   subject: $SUBJECT"
az identity federated-credential create -g "$RG" --identity-name "$IDN" -n github-main \
  --issuer https://token.actions.githubusercontent.com \
  --subject "$SUBJECT" --audiences api://AzureADTokenExchange -o none   # create = tạo hoặc ghi đè
RG_ID=$(az group show -n "$RG" --query id -o tsv)
# Git Bash (Windows) tự đổi tham số "/subscriptions/..." thành đường dẫn file → tắt cho tham số (không đụng biến môi trường).
export MSYS2_ARG_CONV_EXCL="*"
if [ -z "$(az role assignment list --assignee "$PRINCIPAL" --scope "$RG_ID" --role Contributor --query '[0].id' -o tsv)" ]; then
  for i in 1 2 3 4 5 6; do   # identity mới tạo cần vài giây mới thấy được trong directory
    az role assignment create --assignee-object-id "$PRINCIPAL" --assignee-principal-type ServicePrincipal \
      --role Contributor --scope "$RG_ID" -o none && break
    [ "$i" = 6 ] && { echo "!! Không gán được quyền Contributor cho $IDN" >&2; exit 1; }
    sleep 10
  done
fi

cat <<EOF

Xong. Đặt 3 biến này ở GitHub → Settings → Secrets and variables → Actions → Variables
(hoặc: gh variable set <tên> -R $REPO -b <giá trị>):
  AZURE_CLIENT_ID=$CLIENT
  AZURE_TENANT_ID=$TENANT
  AZURE_SUBSCRIPTION_ID=$SUB
Rồi push lên main (hoặc chạy tay workflow "Test and deploy") để CI tạo app.
EOF
