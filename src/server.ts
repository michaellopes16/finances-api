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

const parseRequiredText = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
};

const investmentInclude = {
  contributions: {
    orderBy: { createdAt: 'desc' as const },
  },
};

/**
 * Migração de compatibilidade para os investimentos que já existiam antes
 * da criação de InvestmentContribution.
 *
 * Cada investimento legado recebe exatamente um aporte inicial, usando o
 * amount e o month já armazenados. O historyInitialized evita duplicação.
 */
const ensureLegacyInvestmentHistory = async () => {
  const legacyInvestments = await prisma.investment.findMany({
    where: { historyInitialized: false },
    select: {
      id: true,
      amount: true,
      month: true,
    },
  });

  for (const investment of legacyInvestments) {
    await prisma.$transaction(async (tx) => {
      // "Reivindica" a inicialização deste investimento. Se outra requisição
      // já tiver feito isso, count será 0 e nenhum aporte será duplicado.
      const claimed = await tx.investment.updateMany({
        where: {
          id: investment.id,
          historyInitialized: false,
        },
        data: {
          historyInitialized: true,
        },
      });

      if (claimed.count === 0) return;

      if (investment.amount > 0 && investment.month) {
        await tx.investmentContribution.create({
          data: {
            investmentId: investment.id,
            amount: investment.amount,
            month: investment.month,
            note: 'Saldo inicial migrado',
          },
        });
      }
    });
  }
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
// ROTAS DE INVESTIMENTOS E APORTES
// ==========================================

app.get('/investments', asyncHandler(async (_req, res) => {
  // Compatibilidade: transforma os registros antigos em um histórico inicial.
  await ensureLegacyInvestmentHistory();

  const investments = await prisma.investment.findMany({
    include: investmentInclude,
    orderBy: { createdAt: 'desc' },
  });

  res.json(investments);
}));

/**
 * Cria um novo investimento E registra o primeiro aporte no mesmo mês.
 * O primeiro aporte passa a afetar o saldo restante daquele mês.
 */
app.post('/investments', asyncHandler(async (req, res) => {
  const { description, amount: rawAmount, category, month, groupId } = req.body;
  const amount = parsePositiveAmount(rawAmount);
  const normalizedMonth = parseRequiredText(month);

  if (amount === null) {
    res.status(400).json({ error: 'O valor do investimento deve ser maior que zero.' });
    return;
  }

  if (!normalizedMonth) {
    res.status(400).json({ error: 'Informe o mês do investimento.' });
    return;
  }

  const newInv = await prisma.investment.create({
    data: {
      description,
      amount,
      category,
      month: normalizedMonth,
      groupId,
      historyInitialized: true,
      contributions: {
        create: {
          amount,
          month: normalizedMonth,
          note: 'Aporte inicial',
        },
      },
    },
    include: investmentInclude,
  });

  res.status(201).json(newInv);
}));

/**
 * Edita apenas os metadados do investimento.
 * O patrimônio não é alterado diretamente aqui, pois ele é consequência dos aportes.
 */
app.put('/investments/:id', asyncHandler(async (req, res) => {
  const { description, category, groupId } = req.body;

  const updatedInv = await prisma.investment.update({
    where: { id: req.params.id },
    data: { description, category, groupId },
    include: investmentInclude,
  });

  res.json(updatedInv);
}));

/**
 * Registra um novo aporte no mês selecionado e incrementa o patrimônio acumulado.
 * As duas operações são atômicas: ou as duas acontecem, ou nenhuma acontece.
 */
app.patch('/investments/:id/aporte', asyncHandler(async (req, res) => {
  const amount = parsePositiveAmount(req.body.amount);
  const month = parseRequiredText(req.body.month);

  if (amount === null) {
    res.status(400).json({ error: 'O aporte deve ser maior que zero.' });
    return;
  }

  if (!month) {
    res.status(400).json({ error: 'Informe o mês do aporte.' });
    return;
  }

  const updatedInv = await prisma.$transaction(async (tx) => {
    await tx.investmentContribution.create({
      data: {
        investmentId: req.params.id,
        amount,
        month,
        note: 'Aporte',
      },
    });

    return tx.investment.update({
      where: { id: req.params.id },
      data: {
        amount: { increment: amount },
      },
      include: investmentInclude,
    });
  });

  res.json(updatedInv);
}));

/**
 * Histórico completo ou filtrado por mês.
 * Ex.: GET /investment-contributions?month=Setembro%202026
 */
app.get('/investment-contributions', asyncHandler(async (req, res) => {
  await ensureLegacyInvestmentHistory();

  const { month } = req.query;
  const contributions = await prisma.investmentContribution.findMany({
    where: month ? { month: String(month) } : undefined,
    include: {
      investment: {
        select: {
          id: true,
          description: true,
          category: true,
          groupId: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(contributions);
}));

app.delete('/investments/:id', asyncHandler(async (req, res) => {
  // InvestmentContribution usa onDelete: Cascade.
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
