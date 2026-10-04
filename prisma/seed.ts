import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_QUESTIONS = [
  {
    text: "Ibukota Indonesia adalah …",
    options: ["Jakarta", "Bandung", "Surabaya", "Medan"],
    correctIndex: 0,
    durationSeconds: 20,
  },
  {
    text: "Hasil dari 12 × 8 adalah …",
    options: ["86", "96", "108", "98"],
    correctIndex: 1,
    durationSeconds: 20,
  },
  {
    text: "Lambang kimia air adalah …",
    options: ["CO2", "O2", "H2O", "NaCl"],
    correctIndex: 2,
    durationSeconds: 15,
  },
  {
    text: "Pulau terbesar di Indonesia adalah …",
    options: ["Jawa", "Sumatera", "Kalimantan", "Sulawesi"],
    correctIndex: 2,
    durationSeconds: 20,
  },
  {
    text: "Tahun kemerdekaan Indonesia adalah …",
    options: ["1942", "1945", "1949", "1950"],
    correctIndex: 1,
    durationSeconds: 15,
  },
];

async function main() {
  const n = await prisma.quiz.count();
  if (n > 0) {
    console.log("seed dilewati (sudah ada data)");
    return;
  }
  const quiz = await prisma.quiz.create({
    data: {
      pin: "123456",
      title: "Kuis Contoh: Pengetahuan Umum",
      status: "lobby",
      createdAt: BigInt(Date.now()),
    },
  });
  for (let i = 0; i < SEED_QUESTIONS.length; i++) {
    const q = SEED_QUESTIONS[i];
    await prisma.question.create({
      data: {
        quizId: quiz.id,
        order: i + 1,
        text: q.text,
        options: JSON.stringify(q.options),
        correctIndex: q.correctIndex,
        durationSeconds: q.durationSeconds,
      },
    });
  }
  console.log(`seed selesai: kuis "${quiz.title}" PIN ${quiz.pin} (5 soal)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
