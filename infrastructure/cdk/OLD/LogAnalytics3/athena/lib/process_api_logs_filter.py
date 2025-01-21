import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.dynamicframe import DynamicFrame

# 初期化
args = getResolvedOptions(sys.argv, ['JOB_NAME'])
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# S3パスの設定
input_path = "s3://fargatestack-logbucketcc3b17e8-0djriusfgxia/"
output_path = "s3://fargatestack-logbucketcc3b17e8-0djriusfgxia/processed/"

# データの読み込み
source_dyf = glueContext.create_dynamic_frame.from_options(
    connection_type="s3",
    connection_options={
        "paths": [input_path],
        "recurse": True
    },
    format="json"
)

# フィルタリング条件
def filter_records(rec):
    # 1. "level" キーが存在するかチェック
    if 'level' not in rec:
        return False
    
    # 2. "level" キーが None または空文字でないことをチェック
    if rec['level'] is None or str(rec['level']).strip() == '':
        return False
    
    # 3. その他のフィールドが全て空でないことをチェック
    return not all(
        value is None or str(value).strip() == ''
        for value in rec.values()
    )

# フィルタリングの適用
filtered_dyf = Filter.apply(
    frame=source_dyf,
    f=filter_records
)

# 処理済みデータの書き出し
glueContext.write_dynamic_frame.from_options(
    frame=filtered_dyf,
    connection_type="s3",
    connection_options={
        "path": output_path
    },
    format="json"
)

job.commit()