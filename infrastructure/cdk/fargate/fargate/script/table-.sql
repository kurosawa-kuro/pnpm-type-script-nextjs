CREATE EXTERNAL TABLE ttt01.api_logs (
    level STRING,
    message STRING,
    method STRING,
    origin STRING,
    pathname STRING,
    timestamp STRING
)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
WITH SERDEPROPERTIES (
    'ignore.malformed.json' = 'true',
    'dots.in.keys' = 'true',
    'case.insensitive' = 'true'
)
STORED AS INPUTFORMAT 'org.apache.hadoop.mapred.TextInputFormat'
OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat'
LOCATION 's3://fargatestack-logbucketcc3b17e8-0djriusfgxia/'
TBLPROPERTIES ('has_encrypted_data'='false');