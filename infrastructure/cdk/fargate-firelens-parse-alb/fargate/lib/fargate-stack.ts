import { Construct } from "constructs";
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elb,
  aws_iam as iam,
  aws_s3 as s3,
  aws_s3_assets as assets,
  RemovalPolicy,
  Stack,
  StackProps,
  Duration,
  CfnOutput,
} from "aws-cdk-lib";
import { FirelensLogRouterType } from "aws-cdk-lib/aws-ecs";
import { Effect } from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as firehose from "@aws-cdk/aws-kinesisfirehose-alpha";
import * as destinations from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";

// Configuration Constants
const CONFIG = {
  FLUENT_BIT: {
    CONFIG_PATH: path.join(__dirname, "extra.conf"),
    IMAGE: "public.ecr.aws/aws-observability/aws-for-fluent-bit:init-latest"
  },
  FIREHOSE: {
    DELIVERY_STREAM_NAME: "log-delivery-stream02"
  },
  ECR: {
    ACCOUNT_ID: "985539793438",
    REGION: "ap-northeast-1",
    APP_REPOSITORY: "nextjs-app"
  },
  HEALTH_CHECK: {
    PATH: "/health"
  },
  APP: {
    PORT: 3000
  }
};

export class FargateStack extends Stack {
  private readonly vpc: ec2.Vpc;
  private readonly logBucket: s3.Bucket;
  private readonly albSecurityGroup: ec2.SecurityGroup;
  private readonly fargateSecurityGroup: ec2.SecurityGroup;
  private readonly targetGroup: elb.ApplicationTargetGroup;
  private readonly taskRole: iam.Role;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ロギングインフラ
    this.logBucket = new s3.Bucket(this, "LogBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const asset = new assets.Asset(this, "FluentBitConfigAsset", {
      path: CONFIG.FLUENT_BIT.CONFIG_PATH,
    });

    new firehose.DeliveryStream(this, "LogDeliveryStream", {
      deliveryStreamName: CONFIG.FIREHOSE.DELIVERY_STREAM_NAME,
      destination: new destinations.S3Bucket(this.logBucket, {
        bufferingInterval: Duration.seconds(60)
      })
    });

    // ネットワークインフラ
    this.vpc = new ec2.Vpc(this, "MainVpc", { maxAzs: 2, natGateways: 0 });

    this.albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc: this.vpc,
    });
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("0.0.0.0/0"),
      ec2.Port.tcp(80)
    );

    this.fargateSecurityGroup = new ec2.SecurityGroup(this, "FargateSecurityGroup", {
      vpc: this.vpc,
      description: "Security group for Fargate service",
    });
    
    this.fargateSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(CONFIG.APP.PORT),
      'Allow inbound traffic from ALB on port 3000'
    );

    // ALB設定
    const alb = new elb.ApplicationLoadBalancer(this, "ApplicationLoadBalancer", {
      vpc: this.vpc,
      securityGroup: this.albSecurityGroup,
      internetFacing: true,
    });

    // ALBのURLを出力するためのCfnOutputを修正
    new CfnOutput(this, 'ApplicationLoadBalancerDns', {
      value: `http://${alb.loadBalancerDnsName}/`,
      description: 'Application Load Balancer URL',
      exportName: 'LoadBalancerUrl02',
    });

    const listener = alb.addListener("listener", {
      protocol: elb.ApplicationProtocol.HTTP,
      port: 80,
    });

    this.targetGroup = new elb.ApplicationTargetGroup(this, "ApplicationTargetGroup", {
      vpc: this.vpc,
      port: CONFIG.APP.PORT,
      protocol: elb.ApplicationProtocol.HTTP,
      targetType: elb.TargetType.IP,
      healthCheck: {
        path: CONFIG.HEALTH_CHECK.PATH,
        healthyHttpCodes: "200",
      },
    });

    listener.addTargetGroups("addTargetGroup", {
      targetGroups: [this.targetGroup],
    });

    // ECSインフラ
    const cluster = new ecs.Cluster(this, "EcsCluster", { vpc: this.vpc });
    
    this.taskRole = new iam.Role(this, "EcsTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "logs:CreateLogStream",
          "logs:CreateLogGroup",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "s3:GetObject",
          "s3:GetBucketLocation",
          "firehose:PutRecordBatch",
        ],
        resources: ["*"],
        effect: Effect.ALLOW,
      })
    );

    // ECRアクセス用の専用ポリシーを追加
    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ],
        resources: ["*"],
        effect: Effect.ALLOW,
      })
    );

    this.taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ],
        resources: [`arn:aws:ecr:${CONFIG.ECR.REGION}:${CONFIG.ECR.ACCOUNT_ID}:repository/${CONFIG.ECR.APP_REPOSITORY}`],
        effect: Effect.ALLOW,
      })
    );

    const taskDefinition = this.createTaskDefinition(asset);
    
    const fargateService = new ecs.FargateService(this, "FargateService", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [this.fargateSecurityGroup],
    });

    fargateService.attachToApplicationTargetGroup(this.targetGroup);
  }

  private createTaskDefinition(asset: assets.Asset): ecs.FargateTaskDefinition {
    const taskDefinition = new ecs.FargateTaskDefinition(this, "FargateTaskDefinition", {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole: this.taskRole,
      executionRole: new iam.Role(this, 'EcsTaskExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
        ]
      })
    });

    taskDefinition.addFirelensLogRouter("firelensLogRouter", {
      firelensConfig: {
        type: FirelensLogRouterType.FLUENTBIT,
      },
      environment: {
        aws_fluent_bit_init_s3_1: `arn:aws:s3:::${asset.s3BucketName}/${asset.s3ObjectKey}`,
      },
      image: ecs.ContainerImage.fromRegistry(CONFIG.FLUENT_BIT.IMAGE),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "log-router",
      }),
    });

    taskDefinition.defaultContainer = taskDefinition.addContainer("nextjsContainer", {
      image: ecs.ContainerImage.fromRegistry(
        `${CONFIG.ECR.ACCOUNT_ID}.dkr.ecr.${CONFIG.ECR.REGION}.amazonaws.com/${CONFIG.ECR.APP_REPOSITORY}`
      ),
      logging: ecs.LogDrivers.firelens({
        options: {
          Name: 'firehose',
          region: CONFIG.ECR.REGION,
          delivery_stream: CONFIG.FIREHOSE.DELIVERY_STREAM_NAME
        }
      }),
      portMappings: [{ containerPort: CONFIG.APP.PORT }],
      healthCheck: {
        command: [
          'CMD-SHELL',
          'node -e "const http = require(\'http\'); const options = { hostname: \'localhost\', port: 3000, path: \'/health\', timeout: 2000 }; const req = http.request(options, (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }); req.on(\'error\', () => process.exit(1)); req.end()"'
        ],
        interval: Duration.seconds(15),
        timeout: Duration.seconds(10),
        retries: 5,
        startPeriod: Duration.seconds(90)
      }
    });

    return taskDefinition;
  }
}
