import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';
import 'dotenv/config'; // Garante que as variáveis de ambiente sejam carregadas
import express from 'express';
import { Pool } from 'pg';

const app = express();

// 1. Cria o pool de conexões nativo do Postgres
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

// 2. Cria o adapter do Prisma
const adapter = new PrismaPg(pool);

// 3. Injeta o adapter no Prisma Client
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

// ==========================================
// ROTAS DE GRUPOS
// ==========================================

// Buscar todos os grupos (com opção de filtrar por tipo)
app.get('/groups', async (req, res) => {
  const { type } = req.query;
  const groups = await prisma.group.findMany({
    where: type ? { type: String(type) } : undefined,
  });
  res.json(groups);
});

// Criar um novo grupo
app.post('/groups', async (req, res) => {
  const { name, type, categories } = req.body;
  const newGroup = await prisma.group.create({
    data: { name, type, categories },
  });
  res.status(201).json(newGroup);
});

// Deletar um grupo
app.delete('/groups/:id', async (req, res) => {
  await prisma.group.delete({ where: { id: req.params.id } });
  res.status(204).send();
});


// ==========================================
// ROTAS DE RECEITAS (INCOMES)
// ==========================================

// Buscar receitas de um mês específico
app.get('/incomes', async (req, res) => {
  const { month } = req.query;
  const incomes = await prisma.transaction.findMany({
    where: { 
      month: month ? String(month) : undefined,
      group: { type: 'income' } // Filtra para trazer apenas RECEITAS
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(incomes);
});

// Criar nova receita
app.post('/incomes', async (req, res) => {
  const { description, amount, category, month, status, groupId } = req.body;
  const newIncome = await prisma.transaction.create({
    data: { description, amount, category, month, status, groupId },
  });
  res.status(201).json(newIncome);
});

// Atualizar status da receita (Recebido/Pendente)
app.patch('/incomes/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const updatedIncome = await prisma.transaction.update({
    where: { id },
    data: { status },
  });
  res.json(updatedIncome);
});

// Deletar receita
app.delete('/incomes/:id', async (req, res) => {
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.status(204).send();
});


// ==========================================
// ROTAS DE DESPESAS (TRANSACTIONS)
// ==========================================

// Buscar despesas de um mês específico
app.get('/transactions', async (req, res) => {
  const { month } = req.query;
  const transactions = await prisma.transaction.findMany({
    where: { 
      month: month ? String(month) : undefined,
      group: { type: 'expense' } // Filtra para trazer apenas DESPESAS
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(transactions);
});

// Criar nova despesa
app.post('/transactions', async (req, res) => {
  const { description, amount, category, month, status, groupId } = req.body;
  const newTx = await prisma.transaction.create({
    data: { description, amount, category, month, status, groupId },
  });
  res.status(201).json(newTx);
});

// Atualizar status de uma despesa (Pago/Pendente)
app.patch('/transactions/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const updatedTx = await prisma.transaction.update({
    where: { id },
    data: { status },
  });
  res.json(updatedTx);
});

// Deletar despesa
app.delete('/transactions/:id', async (req, res) => {
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.status(204).send();
});


// ==========================================
// ROTAS DE INVESTIMENTOS
// ==========================================

// Buscar todos os aportes/investimentos
app.get('/investments', async (req, res) => {
  // Investimentos são globais (patrimônio), então trazemos tudo
  const investments = await prisma.investment.findMany({
    orderBy: { createdAt: 'desc' }
  });
  res.json(investments);
});

// Registrar um novo aporte
app.post('/investments', async (req, res) => {
  const { description, amount, category, month, groupId } = req.body;
  const newInv = await prisma.investment.create({
    data: { description, amount, category, month, groupId },
  });
  res.status(201).json(newInv);
});

// Deletar investimento
app.delete('/investments/:id', async (req, res) => {
  await prisma.investment.delete({ where: { id: req.params.id } });
  res.status(204).send();
});


// ==========================================
// INICIALIZAÇÃO
// ==========================================
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});