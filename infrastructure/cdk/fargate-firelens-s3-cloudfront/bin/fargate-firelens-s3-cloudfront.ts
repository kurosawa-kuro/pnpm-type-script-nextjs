#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FargateFirelensS3CloudfrontStack } from '../lib/fargate-firelens-s3-cloudfront-stack';
import { CommonResourceStack } from '../lib/common-resource-stack';

const app = new cdk.App();

const PREFIX = 'cdkfargate01';

const commonResources = new CommonResourceStack(app, 'CommonResourceStack', {
  prefix: PREFIX,
});

new FargateFirelensS3CloudfrontStack(app, 'FargateFirelensS3CloudfrontStack', {
  prefix: PREFIX,
  commonResources,
});