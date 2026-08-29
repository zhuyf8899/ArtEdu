-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'SCHOOL_SSO');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "student_id" TEXT,
    "email" TEXT,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "auth_provider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_student_id_key" ON "users"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
