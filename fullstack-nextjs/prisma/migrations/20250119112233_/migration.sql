/*
  Warnings:

  - You are about to drop the column `title` on the `Sample` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[data]` on the table `Sample` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `data` to the `Sample` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Sample_title_key";

-- AlterTable
ALTER TABLE "Sample" DROP COLUMN "title",
ADD COLUMN     "data" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Sample_data_key" ON "Sample"("data");
