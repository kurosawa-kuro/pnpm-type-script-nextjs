#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FargateFirelensS3CloudfrontStack } from '../lib/fargate-firelens-s3-cloudfront-stack';

const app = new cdk.App();
new FargateFirelensS3CloudfrontStack(app, "cdkFargate01", {
  env: {
    account: "985539793438",
    region: "ap-northeast-1",
  },
});
