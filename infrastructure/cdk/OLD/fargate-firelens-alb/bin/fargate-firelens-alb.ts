#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FargateFirelensAlbStack } from '../lib/fargate-firelens-alb-stack';

const app = new cdk.App();
new FargateFirelensAlbStack(app, 'FargateFirelensAlbStack01', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});