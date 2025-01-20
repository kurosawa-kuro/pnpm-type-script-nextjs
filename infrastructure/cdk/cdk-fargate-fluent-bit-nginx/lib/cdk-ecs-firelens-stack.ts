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
} from "aws-cdk-lib";
import { FirelensLogRouterType } from "aws-cdk-lib/aws-ecs";
import { Effect } from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as firehose from "@aws-cdk/aws-kinesisfirehose-alpha";
import * as destinations from "@aws-cdk/aws-kinesisfirehose-destinations-alpha";

export class CdkEcsFirelensStack extends Stack {
  private readonly prefix: string;
  private readonly vpc: ec2.Vpc;
  private readonly asset: assets.Asset;
  private readonly logBucket: s3.Bucket;
  private readonly albSecurityGroup: ec2.SecurityGroup;
  private readonly fargateSecurityGroup: ec2.SecurityGroup;
  private readonly targetGroup: elb.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    // 基本設定の初期化
    this.prefix = this.initializePrefix();
    
    // インフラストラクチャの初期化
    this.asset = this.createAsset();
    this.logBucket = this.createLogBucket();
    this.createFirehoseDeliveryStream();
    
    // ネットワークの初期化
    this.vpc = this.createVpc();
    this.albSecurityGroup = this.createAlbSecurityGroup();
    this.fargateSecurityGroup = this.createFargateSecurityGroup();
    
    // ALBの初期化
    const alb = this.createAlb();
    const listener = this.createListener(alb);
    this.targetGroup = this.createTargetGroup();
    this.attachTargetGroupToListener(listener);
    
    // ECSの初期化
    const cluster = this.createEcsCluster();
    const taskRole = this.createTaskRole();
    const taskDefinition = this.createTaskDefinition(taskRole);
    this.configureTaskDefinition(taskDefinition);
    this.createFargateService(cluster, taskDefinition);
  }

  private initializePrefix(): string {
    const ver = '01';
    return 'Cdkfargate' + ver;
  }

  private createAsset(): assets.Asset {
    return new assets.Asset(this, this.prefix + "Asset", {
      path: path.join(__dirname, "extra.conf"),
    });
  }

  private createLogBucket(): s3.Bucket {
    return new s3.Bucket(this, this.prefix + "LogBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }

  private createFirehoseDeliveryStream(): void {
    new firehose.DeliveryStream(this, this.prefix + "LogDeliveryStream", {
      deliveryStreamName: this.prefix + "log-delivery-stream",
      destinations: [new destinations.S3Bucket(this.logBucket)],
    });
  }

  private createVpc(): ec2.Vpc {
    return new ec2.Vpc(this, this.prefix + "Vpc", { 
      maxAzs: 2, 
      natGateways: 0 
    });
  }

  private createAlbSecurityGroup(): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this, this.prefix + "AlbSecurityGroup", {
      vpc: this.vpc,
    });
    
    sg.addIngressRule(
      ec2.Peer.ipv4("0.0.0.0/0"),
      ec2.Port.tcp(80)
    );
    
    return sg;
  }

  private createFargateSecurityGroup(): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this, this.prefix + "FargateSecurityGroup", {
      vpc: this.vpc,
    });
    
    sg.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.allTraffic()
    );
    
    return sg;
  }

  private createAlb(): elb.ApplicationLoadBalancer {
    return new elb.ApplicationLoadBalancer(this, this.prefix + "Alb", {
      vpc: this.vpc,
      securityGroup: this.albSecurityGroup,
      internetFacing: true,
    });
  }

  private createListener(alb: elb.ApplicationLoadBalancer): elb.ApplicationListener {
    return alb.addListener(this.prefix + "Listener", {
      protocol: elb.ApplicationProtocol.HTTP,
      port: 80,
    });
  }

  private createTargetGroup(): elb.ApplicationTargetGroup {
    return new elb.ApplicationTargetGroup(this, this.prefix + "TargetGroup", {
      vpc: this.vpc,
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      targetType: elb.TargetType.IP,
      healthCheck: {
        path: "/",
        healthyHttpCodes: "200",
      },
    });
  }

  private attachTargetGroupToListener(listener: elb.ApplicationListener): void {
    listener.addTargetGroups(this.prefix + "AddTargetGroup", {
      targetGroups: [this.targetGroup],
    });
  }

  private createEcsCluster(): ecs.Cluster {
    return new ecs.Cluster(this, this.prefix + "Cluster", { 
      vpc: this.vpc 
    });
  }

  private createTaskRole(): iam.Role {
    const taskRole = new iam.Role(this, this.prefix + "RaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    taskRole.addToPolicy(
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

    return taskRole;
  }

  private createTaskDefinition(taskRole: iam.Role): ecs.FargateTaskDefinition {
    return new ecs.FargateTaskDefinition(this, this.prefix + "taskDefinition", {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole: taskRole,
    });
  }

  private configureTaskDefinition(taskDefinition: ecs.FargateTaskDefinition): void {
    // Fluent Bitログルーターの設定
    taskDefinition.addFirelensLogRouter(this.prefix + "FirelensLogRouter", {
      firelensConfig: {
        type: FirelensLogRouterType.FLUENTBIT,
      },
      environment: {
        aws_fluent_bit_init_s3_1: `arn:aws:s3:::${this.asset.s3BucketName}/${this.asset.s3ObjectKey}`,
      },
      image: ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/aws-observability/aws-for-fluent-bit:init-latest"
      ),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "log-router",
      }),
    });

    // Nginxコンテナの設定
    taskDefinition.defaultContainer = taskDefinition.addContainer(
      this.prefix + "NginxContainer",
      {
        image: ecs.ContainerImage.fromRegistry(
          "public.ecr.aws/nginx/nginx:latest"
        ),
        logging: ecs.LogDrivers.firelens({
          options: {},
        }),
        portMappings: [{ containerPort: 80 }],
      }
    );
  }

  private createFargateService(
    cluster: ecs.Cluster, 
    taskDefinition: ecs.FargateTaskDefinition
  ): ecs.FargateService {
    const service = new ecs.FargateService(this, this.prefix + "FargateService", {
      cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [this.fargateSecurityGroup],
    });

    service.attachToApplicationTargetGroup(this.targetGroup);
    return service;
  }
}
