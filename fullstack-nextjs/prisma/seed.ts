// /home/wsl/app/fullstack-nextjs/src/lib/prisma.tsx
import { prisma } from '../src/lib/prisma';

/**
 * すべてのテーブルのデータを削除する
 */
async function cleanAllTables() {
  await prisma.sample.deleteMany();
  console.log("Cleaned Sample table");

}

async function main() {
  console.log("Starting seed process...");
  
  try {
    // すべてのテーブルをクリーン
    await cleanAllTables();
    
    // ここに初期データの投入処理を追加予定
    

    // サンプルデータの投入
    await prisma.sample.create({
      data: {
        data: "test-data",
        image_path: "/images/test.jpg"
      }
    });
    console.log("Added sample data");

    console.log("Seed process completed");
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2010') {
      console.error(`Table not found error. Please ensure all tables exist and run 'prisma migrate dev' first.`);
    } else {
      console.error('Unexpected error during seed:', error);
    }
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('Seed process failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

