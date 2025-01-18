#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CdkEcsFirelensStack } from "../lib/cdk-ecs-firelens-stack";

const app = new cdk.App();
new CdkEcsFirelensStack(app, "cdk-faragate-fluent-04", {
  env: {
    account: "985539793438",
    region: "ap-northeast-1",
  },
});
