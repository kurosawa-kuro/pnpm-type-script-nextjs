#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FargateFirelensS3CloudfrontStack } from '../lib/fargate-firelens-s3-cloudfront-stack';
import { CommonResourceStack } from '../lib/common-resource-stack';

const CONFIG = {
  prefix: 'cdkfargate01',
  vpcCidr: '10.0.0.0/16',
  appPort: 3000,
  containerConfig: {
    cpu: 512,
    memoryLimitMiB: 1024,
    firelensMemoryMiB: 50,
    appMemoryMiB: 256,
  }
};

const app = new cdk.App();

const commonResources = new CommonResourceStack(app, 'CommonResourceStack', {
});

new FargateFirelensS3CloudfrontStack(app, 'FargateFirelensS3CloudfrontStack', {
  config: CONFIG,
  commonResources,
});