import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
import json
from awsglue.dynamicframe import DynamicFrame

# リファクタイング Todo
# 定数を上部で管理
# database = "fargate_application_logs",
# table_name = "fargatefirelensalbstack01_logbucketcc3b17e8_nabiamtgswdz"
#         "path": "s3://fargate-logs-processed-985539793438/processed-logs/",
#     "partitionKeys": ["year", "month", "day"]


def parse_nested_json(record):
    try:
        # logフィールドの文字列をJSONとしてパース
        log_data = json.loads(record["log"])
        # 必要なフィールドのみを抽出
        return {
            "level": log_data.get("level"),
            "message": log_data.get("message"),
            "method": log_data.get("method"),
            "origin": log_data.get("origin"),
            "pathname": log_data.get("pathname"),
            "headers": log_data.get("headers", {}),
            "geoInfo": log_data.get("geoInfo", {}),
            "timestamp": log_data.get("timestamp")
        }
    except:
        return None

args = getResolvedOptions(sys.argv, ['JOB_NAME'])

sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# データソースの設定
datasource = glueContext.create_dynamic_frame.from_catalog(
    database = "fargate_application_logs",
    table_name = "fargatefirelensalbstack01_logbucketcc3b17e8_nabiamtgswdz"
)

# JSON解析とフィルタリング
mapped_dyf = Map.apply(frame = datasource, f = parse_nested_json)
filtered_dyf = Filter.apply(frame = mapped_dyf, f = lambda x: x is not None)

# 出力先の設定
glueContext.write_dynamic_frame.from_options(
    frame = filtered_dyf,
    connection_type = "s3",
    connection_options = {
        "path": "s3://fargate-logs-processed-985539793438/processed-logs/",
        "partitionKeys": ["year", "month", "day"]
    },
    format = "json"
)

job.commit()

