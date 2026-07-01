import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.BOOTSTRAP_USER_EMAIL;
  const password = process.env.BOOTSTRAP_USER_PASSWORD;

  if (!email || !password) {
    console.log("[seed] BOOTSTRAP_USER_EMAIL / BOOTSTRAP_USER_PASSWORD not set — skipping");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] user ${email} already exists — skipping`);
    return;
  }

  const anyUser = await prisma.user.findFirst();
  if (anyUser) {
    console.log("[seed] another user already exists — refusing to seed a second one");
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, password: hash, name: "Founder" }
  });
  console.log(`[seed] bootstrap user ${email} created`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
