#!/bin/bash

# エラーハンドリングの設定
set -e
trap 'echo "エラーが発生しました。スクリプトを終了します。"; exit 1' ERR

# ユーティリティ関数
wait_for_deletion() {
    local resource_type=$1
    local resource_id=$2
    local max_attempts=30
    local attempt=1
    
    echo "🕒 ${resource_type}の削除完了を待機中: ${resource_id}"
    while [ $attempt -le $max_attempts ]; do
        sleep 10
        if ! aws ec2 describe-${resource_type}s --${resource_type}-ids $resource_id >/dev/null 2>&1; then
            echo "✅ ${resource_type}の削除が完了しました: ${resource_id}"
            return 0
        fi
        echo "⏳ 待機中... (${attempt}/${max_attempts})"
        ((attempt++))
    done
    echo "❌ ${resource_type}の削除がタイムアウトしました: ${resource_id}"
    return 1
}

# VPC IDの検証
if [ -z "$1" ]; then
    echo "使用方法: $0 <VPC_ID>"
    exit 1
fi

VPC_ID=$1
echo "🚀 VPC削除プロセスを開始します: ${VPC_ID}"

# ELBの削除
echo "📝 ELBの削除を開始..."
aws elbv2 describe-load-balancers --query 'LoadBalancers[?VpcId==`'$VPC_ID'`].[LoadBalancerArn]' --output text | while read alb; do
    if [ ! -z "$alb" ]; then
        echo "削除中: $alb"
        aws elbv2 delete-load-balancer --load-balancer-arn $alb
        sleep 30  # ELBの削除完了を待機
    fi
done

# NAT Gatewayの削除
echo "📝 NAT Gatewayの削除を開始..."
aws ec2 describe-nat-gateways --filter Name=vpc-id,Values=$VPC_ID --query 'NatGateways[*].NatGatewayId' --output text | while read nat; do
    if [ ! -z "$nat" ]; then
        aws ec2 delete-nat-gateway --nat-gateway-id $nat
        wait_for_deletion "nat-gateway" $nat
    fi
done

# VPCエンドポイントの削除
echo "📝 VPCエンドポイントの削除を開始..."
aws ec2 describe-vpc-endpoints --filters Name=vpc-id,Values=$VPC_ID --query 'VpcEndpoints[*].VpcEndpointId' --output text | while read endpoint; do
    if [ ! -z "$endpoint" ]; then
        aws ec2 delete-vpc-endpoints --vpc-endpoint-ids $endpoint
        wait_for_deletion "vpc-endpoint" $endpoint
    fi
done

# セキュリティグループの削除
echo "📝 セキュリティグループの削除を開始..."
aws ec2 describe-security-groups --filters Name=vpc-id,Values=$VPC_ID --query 'SecurityGroups[?GroupName!=`default`].GroupId' --output text | while read sg; do
    if [ ! -z "$sg" ]; then
        aws ec2 delete-security-group --group-id $sg
        echo "✅ セキュリティグループを削除しました: $sg"
    fi
done

# サブネットの削除
echo "📝 サブネットの削除を開始..."
aws ec2 describe-subnets --filters Name=vpc-id,Values=$VPC_ID --query 'Subnets[*].SubnetId' --output text | while read subnet; do
    if [ ! -z "$subnet" ]; then
        aws ec2 delete-subnet --subnet-id $subnet
        echo "✅ サブネットを削除しました: $subnet"
    fi
done

# インターネットゲートウェイのデタッチと削除
echo "📝 インターネットゲートウェイの削除を開始..."
aws ec2 describe-internet-gateways --filters Name=attachment.vpc-id,Values=$VPC_ID --query 'InternetGateways[*].InternetGatewayId' --output text | while read igw; do
    if [ ! -z "$igw" ]; then
        aws ec2 detach-internet-gateway --internet-gateway-id $igw --vpc-id $VPC_ID
        aws ec2 delete-internet-gateway --internet-gateway-id $igw
        echo "✅ インターネットゲートウェイを削除しました: $igw"
    fi
done

# VPCの削除
echo "📝 VPCの削除を開始..."
aws ec2 delete-vpc --vpc-id $VPC_ID
echo "✅ VPCを削除しました: $VPC_ID"

echo "🎉 全てのリソースの削除が完了しました！" 