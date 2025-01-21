#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AthenaStack } from '../lib/athena-stack';

const app = new cdk.App();
new AthenaStack(app, 'AthenaStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});