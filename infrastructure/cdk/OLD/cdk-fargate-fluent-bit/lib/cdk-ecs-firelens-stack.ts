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
} from "aws-cdk-lib";
import { FirelensLogRouterType } from "aws-cdk-lib/aws-ecs";
import { Effect } from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as firehose from "@aws-cdk/aws-kinesisfirehose-alpha";
import * as destinations from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";

export class CdkEcsFirelensStack extends Stack {
  private readonly vpc: ec2.Vpc;
  private readonly logBucket: s3.Bucket;
  private readonly albSecurityGroup: ec2.SecurityGroup;
  private readonly fargateSecurityGroup: ec2.SecurityGroup;
  private readonly targetGroup: elb.ApplicationTargetGroup;
  private readonly taskRole: iam.Role;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ロギングインフラ
    this.logBucket = new s3.Bucket(this, "logBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const asset = new assets.Asset(this, "asset", {
      path: path.join(__dirname, "extra.conf"),
    });

    new firehose.DeliveryStream(this, "logDeliveryStream", {
      deliveryStreamName: "log-delivery-stream02",
      destinations: [
        new destinations.S3Bucket(this.logBucket, {
          bufferingInterval: Duration.seconds(60)
        })
      ],
    });

    // ネットワークインフラ
    this.vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 2, natGateways: 0 });

    this.albSecurityGroup = new ec2.SecurityGroup(this, "albSecurityGroup", {
      vpc: this.vpc,
    });
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4("0.0.0.0/0"),
      ec2.Port.tcp(80)
    );

    this.fargateSecurityGroup = new ec2.SecurityGroup(this, "fargateSecurityGroup", {
      vpc: this.vpc,
      description: "Security group for Fargate service",
    });
    
    this.fargateSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow inbound traffic from ALB on port 3000'
    );

    // ALB設定
    const alb = new elb.ApplicationLoadBalancer(this, "alb", {
      vpc: this.vpc,
      securityGroup: this.albSecurityGroup,
      internetFacing: true,
    });

    const listener = alb.addListener("listener", {
      protocol: elb.ApplicationProtocol.HTTP,
      port: 80,
    });

    this.targetGroup = new elb.ApplicationTargetGroup(this, "targetGroup", {
      vpc: this.vpc,
      port: 3000,
      protocol: elb.ApplicationProtocol.HTTP,
      targetType: elb.TargetType.IP,
      healthCheck: {
        path: "/health",
        healthyHttpCodes: "200",
      },
    });

    listener.addTargetGroups("addTargetGroup", {
      targetGroups: [this.targetGroup],
    });

    // ECSインフラ
    const cluster = new ecs.Cluster(this, "cluster", { vpc: this.vpc });
    
    this.taskRole = new iam.Role(this, "taskRole", {
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
        resources: ["*"],  // GetAuthorizationTokenはリソースレベルの制限をサポートしていません
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
        resources: [`arn:aws:ecr:ap-northeast-1:985539793438:repository/nextjs-app`],
        effect: Effect.ALLOW,
      })
    );

    const taskDefinition = this.createTaskDefinition(asset);
    
    const fargateService = new ecs.FargateService(this, "fargateService", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [this.fargateSecurityGroup],
    });

    fargateService.attachToApplicationTargetGroup(this.targetGroup);
  }

  private createTaskDefinition(asset: assets.Asset): ecs.FargateTaskDefinition {
    const taskDefinition = new ecs.FargateTaskDefinition(this, "taskDefinition", {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole: this.taskRole,
      executionRole: new iam.Role(this, 'TaskExecutionRole', {
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
      image: ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/aws-observability/aws-for-fluent-bit:init-latest"
      ),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "log-router",
      }),
    });

    taskDefinition.defaultContainer = taskDefinition.addContainer("nextjsContainer", {
      image: ecs.ContainerImage.fromRegistry(
        "985539793438.dkr.ecr.ap-northeast-1.amazonaws.com/nextjs-app"
      ),
      logging: ecs.LogDrivers.firelens({
        options: {
          Name: 'firehose',
          region: 'ap-northeast-1',
          delivery_stream: 'log-delivery-stream02'
        }
      }),
      portMappings: [{ containerPort: 3000 }],
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
