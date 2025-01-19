import { Construct } from "constructs";
import {
  aws_ecs as ecs,
  aws_s3_assets as assets,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_s3 as s3,
  Stack,
  StackProps,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";
import { FirelensLogRouterType } from "aws-cdk-lib/aws-ecs";
import * as path from "path";
import * as firehose from "@aws-cdk/aws-kinesisfirehose-alpha";
import * as destinations from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import { CommonResourceStack } from "./common-resource-stack";

// // スタックの設定インターフェース
// interface StackConfig {
//   prefix: string;
//   vpcCidr: string;
//   containerConfig: {
//     cpu: number;
//     memoryLimitMiB: number;
//     firelensMemoryMiB: number;
//     appMemoryMiB: number;
//   };
// }

interface FargateFirelensS3CloudfrontStackProps extends StackProps {
  config: {
    prefix: string;
    vpcCidr: string;
    appPort: number;
    containerConfig: {
      cpu: number;
      memoryLimitMiB: number;
      firelensMemoryMiB: number;
      appMemoryMiB: number;
    }
  };
  commonResources: CommonResourceStack;
}

export class FargateFirelensS3CloudfrontStack extends Stack {
  constructor(scope: Construct, id: string, props: FargateFirelensS3CloudfrontStackProps) {
    super(scope, id, props);

    const resourceName = props.config.prefix;

    // ネットワークリソースの作成
    const { vpc, securityGroup } = props.commonResources.createNetworkResources(
      resourceName,
      {
        vpcCidr: props.config.vpcCidr,
        appPort: props.config.appPort
      }
    );

    // ストレージリソースの作成
    const { logBucket, imageBucket } = props.commonResources.createStorageResources(resourceName);

    // IAMリソースの作成
    const { taskRole, executionRole } = props.commonResources.createIAMResources(resourceName);

    // ECSリソースの作成
    const {  service } = props.commonResources.createECSResources(
      props.config,
      vpc,
      securityGroup,
      taskRole,
      executionRole,
      logBucket
    );

    // CloudFrontリソースの作成
    const { distribution } = props.commonResources.createCloudfrontResources(
      resourceName,
      imageBucket,
      service
    );

    // 出力の設定
    // ロードバランサー出力が漏れている
    new CfnOutput(this, 'CloudFrontDomainName', {
      value: distribution.distributionDomainName,
    });
  }
}