#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FargateFirelensS3CloudfrontStack } from '../lib/fargate-firelens-s3-cloudfront-stack';
import { CommonResourceStack } from '../lib/common-resource-stack';

const VERSION = '10';

const CONFIG = {
  version: VERSION,
  prefix: 'cdkfargate0' + VERSION,
  vpcCidr: '10.' + VERSION + '.0.0/16',
  appPort: 3000,
  containerConfig: {
    cpu: 512,
    memoryLimitMiB: 1024,
    firelensMemoryMiB: 50,
    appMemoryMiB: 256,
    containerImage: '985539793438.dkr.ecr.ap-northeast-1.amazonaws.com/nextjs-app'
  }
};

const app = new cdk.App();

const commonResources = new CommonResourceStack(app, CONFIG.prefix + '-CommonResourceStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});

new FargateFirelensS3CloudfrontStack(app, CONFIG.prefix + '-FargateFirelensS3CloudfrontStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
  config: CONFIG,
  commonResources,
});

app.synth();