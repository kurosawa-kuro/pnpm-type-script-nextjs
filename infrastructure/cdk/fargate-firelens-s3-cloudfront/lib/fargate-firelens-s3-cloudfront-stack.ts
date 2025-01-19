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

    // リソースの作成
    const resources = this.createResources(props);
    
    // 出力の設定
    this.configureOutputs(resources);
  }

  private createResources(props: FargateFirelensS3CloudfrontStackProps) {
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
    const { service } = props.commonResources.createECSResources(
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

    return { service, distribution, logBucket };
  }

  private configureOutputs(resources: { 
    service: any, 
    distribution: any, 
    logBucket: any 
  }) {
    new CfnOutput(this, 'ServiceDNS', {
      value: resources.service.cluster.clusterName,
      description: 'ECS Service Cluster Name'
    });

    new CfnOutput(this, 'CloudFrontDomainName', {
      value: resources.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name'
    });

    new CfnOutput(this, 'S3BucketName', {
      value: resources.logBucket.bucketName,
      description: 'S3 Bucket Name'
    });
  }
}
