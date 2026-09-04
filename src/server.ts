import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';
import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';

const app = express();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL não foi definida.');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

const asyncHandler = (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const parsePositiveAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

// Rota leve para verificar se a API está acordada.
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ==========================================
// ROTAS DE GRUPOS
// ==========================================

app.get('/groups', asyncHandler(async (req, res) => {
  const { type } = req.query;
  const groups = await prisma.group.findMany({
    where: type ? { type: String(type) } : undefined,
  });
  res.json(groups);
}));

app.post('/groups', asyncHandler(async (req, res) => {
  const { name, type, categories } = req.body;
  const newGroup = await prisma.group.create({
    data: { name, type, categories },
  });
  res.status(201).json(newGroup);
}));

app.put('/groups/:id', asyncHandler(async (req, res) => {
  const { name, categories } = req.body;
  const updatedGroup = await prisma.group.update({
    where: { id: req.params.id },
    data: { name, categories },
  });
  res.json(updatedGroup);
}));

app.delete('/groups/:id', asyncHandler(async (req, res) => {
  await prisma.group.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

// ==========================================
// ROTAS DE RECEITAS (INCOMES)
// ==========================================

app.get('/incomes', asyncHandler(async (req, res) => {
  const { month } = req.query;
  const incomes = await prisma.transaction.findMany({
    where: {
      month: month ? String(month) : undefined,
      group: { type: 'income' },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(incomes);
}));

app.post('/incomes', asyncHandler(async (req, res) => {
  const { description, amount: rawAmount, category, month, status, groupId } = req.body;
  const amount = parsePositiveAmount(rawAmount);
  if (amount === null) {
    res.status(400).json({ error: 'O valor da receita deve ser maior que zero.' });
    return;
  }

  const newIncome = await prisma.transaction.create({
    data: { description, amount, category, month, status, groupId },
  });
  res.status(201).json(newIncome);
}));

// Edição completa da receita. Antes essa alteração existia somente no estado do app.
app.put('/incomes/:id', asyncHandler(async (req, res) => {
  const { description, amount: rawAmount, category, month, status, groupId } = req.body;
  const amount = parsePositiveAmount(rawAmount);
  if (amount === null) {
    res.status(400).json({ error: 'O valor da receita deve ser maior que zero.' });
    return;
  }

  const updatedIncome = await prisma.transaction.update({
    where: { id: req.params.id },
    data: { description, amount, category, month, status, groupId },
  });
  res.json(updatedIncome);
}));

app.patch('/incomes/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  const updatedIncome = await prisma.transaction.update({
    where: { id: req.params.id },
    data: { status },
  });
  res.json(updatedIncome);
}));

app.delete('/incomes/:id', asyncHandler(async (req, res) => {
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

// ==========================================
// ROTAS DE DESPESAS (TRANSACTIONS)
// ==========================================

app.get('/transactions', asyncHandler(async (req, res) => {
  const { month } = req.query;
  const transactions = await prisma.transaction.findMany({
    where: {
      month: month ? String(month) : undefined,
      group: { type: 'expense' },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(transactions);
}));

app.post('/transactions', asyncHandler(async (req, res) => {
  const { description, amount: rawAmount, category, month, status, groupId } = req.body;
  const amount = parsePositiveAmount(rawAmount);
  if (amount === null) {
    res.status(400).json({ error: 'O valor da despesa deve ser maior que zero.' });
    return;
  }

  const newTx = await prisma.transaction.create({
    data: { description, amount, category, month, status, groupId },
  });
  res.status(201).json(newTx);
}));

app.put('/transactions/:id', asyncHandler(async (req, res) => {
  const { description, amount: rawAmount, category, month, status, groupId } = req.body;
  const amount = parsePositiveAmount(rawAmount);
  if (amount === null) {
    res.status(400).json({ error: 'O valor da despesa deve ser maior que zero.' });
    return;
  }

  const updatedTx = await prisma.transaction.update({
    where: { id: req.params.id },
    data: { description, amount, category, month, status, groupId },
  });
  res.json(updatedTx);
}));

app.patch('/transactions/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  const updatedTx = await prisma.transaction.update({
    where: { id: req.params.id },
    data: { status },
  });
  res.json(updatedTx);
}));

app.delete('/transactions/:id', asyncHandler(async (req, res) => {
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

// ==========================================
// ROTAS DE INVESTIMENTOS
// ==========================================

app.get('/investments', asyncHandler(async (_req, res) => {
  const investments = await prisma.investment.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.json(investments);
}));

app.post('/investments', asyncHandler(async (req, res) => {
  const { description, amount: rawAmount, category, month, groupId } = req.body;
  const amount = parsePositiveAmount(rawAmount);
  if (amount === null) {
    res.status(400).json({ error: 'O valor do investimento deve ser maior que zero.' });
    return;
  }

  const newInv = await prisma.investment.create({
    data: { description, amount, category, month, groupId },
  });
  res.status(201).json(newInv);
}));

app.put('/investments/:id', asyncHandler(async (req, res) => {
  const { description, amount: rawAmount, category, month, groupId } = req.body;
  const amount = parsePositiveAmount(rawAmount);
  if (amount === null) {
    res.status(400).json({ error: 'O valor do investimento deve ser maior que zero.' });
    return;
  }

  const updatedInv = await prisma.investment.update({
    where: { id: req.params.id },
    data: { description, amount, category, month, groupId },
  });
  res.json(updatedInv);
}));

// Persiste o botão "+ Aporte" no banco usando incremento atômico.
app.patch('/investments/:id/aporte', asyncHandler(async (req, res) => {
  const amount = parsePositiveAmount(req.body.amount);
  if (amount === null) {
    res.status(400).json({ error: 'O aporte deve ser maior que zero.' });
    return;
  }

  const updatedInv = await prisma.investment.update({
    where: { id: req.params.id },
    data: {
      amount: { increment: amount },
    },
  });
  res.json(updatedInv);
}));

app.delete('/investments/:id', asyncHandler(async (req, res) => {
  await prisma.investment.delete({ where: { id: req.params.id } });
  res.status(204).send();
}));

// ==========================================
// TRATAMENTO DE ERROS E INICIALIZAÇÃO
// ==========================================

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const PORT = Number(process.env.PORT) || 3333;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
