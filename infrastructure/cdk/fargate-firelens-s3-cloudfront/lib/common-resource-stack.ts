import { Construct } from "constructs";
import {
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_s3 as s3,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Effect } from "aws-cdk-lib/aws-iam";

export interface CommonResourceStackProps extends StackProps {
  prefix: string;
}

export function getResourceName(prefix: string, resourceType: string): string {
  return `${prefix}${resourceType.charAt(0).toUpperCase()}${resourceType.slice(1)}`;
}

export class CommonResourceStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly fargateSecurityGroup: ec2.SecurityGroup;
  public readonly taskRole: iam.Role;
  public readonly logBucket: s3.Bucket;
  public readonly imageBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: CommonResourceStackProps) {
    super(scope, id, props);

    // VPC作成
    this.vpc = new ec2.Vpc(this, getResourceName(props.prefix, 'vpc'), {
      vpcName: getResourceName(props.prefix, 'vpc'),
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{
        name: 'Public',
        subnetType: ec2.SubnetType.PUBLIC,
        mapPublicIpOnLaunch: true,
        cidrMask: 24
      }],
      createInternetGateway: true
    });

    // インターネットゲートウェイのアタッチ
    const igw = new ec2.CfnInternetGateway(this, getResourceName(props.prefix, 'igw'), {});
    const vpcId = this.vpc.vpcId;
    
    new ec2.CfnVPCGatewayAttachment(this, getResourceName(props.prefix, 'igwAttachment'), {
      vpcId: vpcId,
      internetGatewayId: igw.ref
    });

    // パブリックサブネットのルートテーブル設定
    this.vpc.publicSubnets.forEach((subnet, index) => {
      const routeTable = new ec2.CfnRouteTable(this, getResourceName(props.prefix, `publicRouteTable${index}`), {
        vpcId: vpcId
      });

      new ec2.CfnRoute(this, getResourceName(props.prefix, `publicRoute${index}`), {
        routeTableId: routeTable.ref,
        destinationCidrBlock: '0.0.0.0/0',
        gatewayId: igw.ref
      });

      new ec2.CfnSubnetRouteTableAssociation(this, getResourceName(props.prefix, `publicRouteTableAssoc${index}`), {
        subnetId: subnet.subnetId,
        routeTableId: routeTable.ref
      });
    });

    // セキュリティグループ作成
    this.fargateSecurityGroup = new ec2.SecurityGroup(
      this,
      getResourceName(props.prefix, 'fargateSecurityGroup'),
      {
        vpc: this.vpc,
        securityGroupName: getResourceName(props.prefix, 'fargateSecurityGroup'),
        description: 'Security group for Fargate containers'
      }
    );

    // セキュリティグループルールの追加
    this.fargateSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic'
    );

    this.fargateSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic'
    );

    // タスクロール作成
    this.taskRole = new iam.Role(this, getResourceName(props.prefix, 'taskRole'), {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // タスクロールへのポリシー追加
    this.taskRole.addToPolicy(new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:GetObject',
        's3:ListBucket'
      ],
      resources: [
        'arn:aws:s3:::*/*'
      ]
    }));

    // ログバケット作成
    this.logBucket = new s3.Bucket(this, getResourceName(props.prefix, 'logBucket'), {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // 画像バケット作成
    this.imageBucket = new s3.Bucket(this, getResourceName(props.prefix, 'imageBucket'), {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.GET,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ['*'],
          exposedHeaders: [],
        },
      ],
    });
  }
}