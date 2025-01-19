import { Construct } from "constructs";
import {
  Stack,
  StackProps,
  CfnOutput,
} from "aws-cdk-lib";
import { CommonResourceStack } from "./common-resource-stack";

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
      containerImage: string;
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
    const { taskRole, executionRole } = props.commonResources.createIAMResources(resourceName, logBucket);

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
    new CfnOutput(this, 'LoadBalancerDNS', {
      value: service.loadBalancer.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name'
    });

    new CfnOutput(this, 'CloudFrontDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name'
    });
  }
}