import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const samples = await prisma.sample.findMany();
    return NextResponse.json(samples);
  } catch (error) {
    console.error('Error fetching samples:', error);
    return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    if (!body.data) {
      return NextResponse.json(
        { error: 'Data is required' },
        { status: 400 }
      );
    }

    const sample = await prisma.sample.create({
      data: {
        data: body.data,
        image_path: body.image_path ?? '',
      },
    });

    return NextResponse.json(sample);
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error creating sample:', error.message);
      return NextResponse.json(
        { error: 'Failed to create sample: ' + error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create sample' },
      { status: 500 }
    );
  }
}