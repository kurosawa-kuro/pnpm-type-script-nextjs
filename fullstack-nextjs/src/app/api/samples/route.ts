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
    const data = await request.json();
    const sample = await prisma.sample.create({
      data: {
        data: data.data,
        ...(data.image_path && { image_path: data.image_path }),
      },
    });
    return NextResponse.json(sample);
  } catch (error) {
    console.error('Error creating sample:', error);
    return NextResponse.json({ error: 'Failed to create sample' }, { status: 500 });
  }
}