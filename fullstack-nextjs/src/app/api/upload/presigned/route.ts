import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-1',
});

export async function POST(request: Request) {
  try {
    const { fileName } = await request.json();
    const key = `uploads/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: 'cdk-faragate-01-cdkfaragate01imagebucket35b36a98-kt8ywaedixvu',
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return NextResponse.json({ url, key });
  } catch (error) {
    console.log("error",error)
    return NextResponse.json(
      { error: 'プリサイン付きURLの生成に失敗しました' },
      { status: 500 }
    );
  }
}