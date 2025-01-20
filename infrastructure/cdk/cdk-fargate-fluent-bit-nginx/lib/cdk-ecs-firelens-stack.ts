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

// リソース作成を担当するクラス
class ResourceFactory {
  private readonly prefix: string;
  private readonly scope: Construct;

  constructor(scope: Construct, prefix: string) {
    this.scope = scope;
    this.prefix = prefix;
  }

  public createAsset(): assets.Asset {
    return new assets.Asset(this.scope, this.prefix + "Asset", {
      path: path.join(__dirname, "extra.conf"),
    });
  }

  public createLogBucket(): s3.Bucket {
    return new s3.Bucket(this.scope, this.prefix + "LogBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }

  public createFirehoseDeliveryStream(logBucket: s3.Bucket): void {
    new firehose.DeliveryStream(this.scope, this.prefix + "LogDeliveryStream", {
      deliveryStreamName: this.prefix + "log-delivery-stream",
      destinations: [new destinations.S3Bucket(logBucket)],
    });
  }

  public createVpc(): ec2.Vpc {
    return new ec2.Vpc(this.scope, this.prefix + "Vpc", { 
      maxAzs: 2, 
      natGateways: 0 
    });
  }

  public createAlbSecurityGroup(vpc: ec2.Vpc): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this.scope, this.prefix + "AlbSecurityGroup", {
      vpc: vpc,
    });
    
    sg.addIngressRule(
      ec2.Peer.ipv4("0.0.0.0/0"),
      ec2.Port.tcp(80)
    );
    
    return sg;
  }

  public createFargateSecurityGroup(vpc: ec2.Vpc, albSecurityGroup: ec2.SecurityGroup): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this.scope, this.prefix + "FargateSecurityGroup", {
      vpc: vpc,
    });
    
    sg.addIngressRule(
      albSecurityGroup,
      ec2.Port.allTraffic()
    );
    
    return sg;
  }

  public createAlb(vpc: ec2.Vpc, albSecurityGroup: ec2.SecurityGroup): elb.ApplicationLoadBalancer {
    return new elb.ApplicationLoadBalancer(this.scope, this.prefix + "Alb", {
      vpc: vpc,
      securityGroup: albSecurityGroup,
      internetFacing: true,
    });
  }

  public createListener(alb: elb.ApplicationLoadBalancer): elb.ApplicationListener {
    return alb.addListener(this.prefix + "Listener", {
      protocol: elb.ApplicationProtocol.HTTP,
      port: 80,
    });
  }

  public createTargetGroup(vpc: ec2.Vpc): elb.ApplicationTargetGroup {
    return new elb.ApplicationTargetGroup(this.scope, this.prefix + "TargetGroup", {
      vpc: vpc,
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      targetType: elb.TargetType.IP,
      healthCheck: {
        path: "/",
        healthyHttpCodes: "200",
      },
    });
  }

  public attachTargetGroupToListener(listener: elb.ApplicationListener, targetGroup: elb.ApplicationTargetGroup): void {
    listener.addTargetGroups(this.prefix + "AddTargetGroup", {
      targetGroups: [targetGroup],
    });
  }

  public createEcsCluster(vpc: ec2.Vpc): ecs.Cluster {
    return new ecs.Cluster(this.scope, this.prefix + "Cluster", { 
      vpc: vpc 
    });
  }

  public createTaskRole(): iam.Role {
    const taskRole = new iam.Role(this.scope, this.prefix + "RaskRole", {
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

  public createTaskDefinition(taskRole: iam.Role): ecs.FargateTaskDefinition {
    return new ecs.FargateTaskDefinition(this.scope, this.prefix + "taskDefinition", {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole: taskRole,
    });
  }

  public configureTaskDefinition(taskDefinition: ecs.FargateTaskDefinition, asset: assets.Asset): void {
    // Fluent Bitログルーターの設定
    taskDefinition.addFirelensLogRouter(this.prefix + "FirelensLogRouter", {
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

  public createFargateService(
    cluster: ecs.Cluster, 
    taskDefinition: ecs.FargateTaskDefinition,
    fargateSecurityGroup: ec2.SecurityGroup,
    targetGroup: elb.ApplicationTargetGroup
  ): ecs.FargateService {
    const service = new ecs.FargateService(this.scope, this.prefix + "FargateService", {
      cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [fargateSecurityGroup],
    });

    service.attachToApplicationTargetGroup(targetGroup);
    return service;
  }
}

// メインのスタッククラス
export class CdkEcsFirelensStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    // プレフィックスの初期化
    const prefix = 'Cdkfargate01';
    
    // リソースファクトリーの初期化
    const factory = new ResourceFactory(this, prefix);
    
    // リソースの作成
    const asset = factory.createAsset();
    const logBucket = factory.createLogBucket();
    factory.createFirehoseDeliveryStream(logBucket);
    
    const vpc = factory.createVpc();
    const albSecurityGroup = factory.createAlbSecurityGroup(vpc);
    const fargateSecurityGroup = factory.createFargateSecurityGroup(vpc, albSecurityGroup);
    
    const alb = factory.createAlb(vpc, albSecurityGroup);
    const listener = factory.createListener(alb);
    const targetGroup = factory.createTargetGroup(vpc);
    factory.attachTargetGroupToListener(listener, targetGroup);
    
    const cluster = factory.createEcsCluster(vpc);
    const taskRole = factory.createTaskRole();
    const taskDefinition = factory.createTaskDefinition(taskRole);
    factory.configureTaskDefinition(taskDefinition, asset);
    factory.createFargateService(cluster, taskDefinition, fargateSecurityGroup, targetGroup);
  }
}
