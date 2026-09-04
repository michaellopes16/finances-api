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

const normalizeCategories = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
};

const validateEntryGroupAndCategory = async (
  groupIdValue: unknown,
  categoryValue: unknown,
  expectedType: 'income' | 'expense' | 'investment',
) => {
  const groupId = parseRequiredText(groupIdValue);
  const category = parseRequiredText(categoryValue);

  if (!groupId) return { error: 'Grupo não informado.' as const };
  if (!category) return { error: 'Categoria não informada.' as const };

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) return { error: 'O grupo selecionado não existe mais.' as const };
  if (group.type !== expectedType) return { error: 'O grupo selecionado possui um tipo incompatível com o lançamento.' as const };
  if (!group.categories.includes(category)) {
    return { error: `A categoria "${category}" não existe mais neste grupo.` as const };
  }

  return { groupId, category };
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
  const name = parseRequiredText(req.body.name);
  const type = parseRequiredText(req.body.type);
  const categories = normalizeCategories(req.body.categories);

  if (!name || !type) {
    res.status(400).json({ error: 'Informe nome e tipo do grupo.' });
    return;
  }

  if (categories.length === 0) {
    res.status(400).json({ error: 'O grupo precisa ter pelo menos uma categoria.' });
    return;
  }

  const newGroup = await prisma.group.create({
    data: { name, type, categories },
  });
  res.status(201).json(newGroup);
}));

app.put('/groups/:id', asyncHandler(async (req, res) => {
  const name = parseRequiredText(req.body.name);
  const categories = normalizeCategories(req.body.categories);

  if (!name) {
    res.status(400).json({ error: 'Informe o nome do grupo.' });
    return;
  }

  if (categories.length === 0) {
    res.status(400).json({ error: 'O grupo precisa ter pelo menos uma categoria.' });
    return;
  }

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
  const description = parseRequiredText(req.body.description);
  const month = parseRequiredText(req.body.month);
  const status = parseRequiredText(req.body.status) ?? 'pending';
  const amount = parsePositiveAmount(req.body.amount);
  const groupValidation = await validateEntryGroupAndCategory(req.body.groupId, req.body.category, 'income');

  if (!description || !month) {
    res.status(400).json({ error: 'Informe descrição e mês da receita.' });
    return;
  }

  if (amount === null) {
    res.status(400).json({ error: 'O valor da receita deve ser maior que zero.' });
    return;
  }

  if ('error' in groupValidation) {
    res.status(400).json({ error: groupValidation.error });
    return;
  }

  const created = await prisma.transaction.create({
    data: {
      description,
      amount,
      category: groupValidation.category,
      month,
      status,
      groupId: groupValidation.groupId,
    },
  });
  res.status(201).json(created);
}));

app.put('/incomes/:id', asyncHandler(async (req, res) => {
  const description = parseRequiredText(req.body.description);
  const month = parseRequiredText(req.body.month);
  const status = parseRequiredText(req.body.status) ?? 'pending';
  const amount = parsePositiveAmount(req.body.amount);
  const groupValidation = await validateEntryGroupAndCategory(req.body.groupId, req.body.category, 'income');

  if (!description || !month) {
    res.status(400).json({ error: 'Informe descrição e mês da receita.' });
    return;
  }

  if (amount === null) {
    res.status(400).json({ error: 'O valor da receita deve ser maior que zero.' });
    return;
  }

  if ('error' in groupValidation) {
    res.status(400).json({ error: groupValidation.error });
    return;
  }

  const updated = await prisma.transaction.update({
    where: { id: req.params.id },
    data: {
      description,
      amount,
      category: groupValidation.category,
      month,
      status,
      groupId: groupValidation.groupId,
    },
  });
  res.json(updated);
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
  const description = parseRequiredText(req.body.description);
  const month = parseRequiredText(req.body.month);
  const status = parseRequiredText(req.body.status) ?? 'pending';
  const amount = parsePositiveAmount(req.body.amount);
  const groupValidation = await validateEntryGroupAndCategory(req.body.groupId, req.body.category, 'expense');

  if (!description || !month) {
    res.status(400).json({ error: 'Informe descrição e mês da despesa.' });
    return;
  }

  if (amount === null) {
    res.status(400).json({ error: 'O valor da despesa deve ser maior que zero.' });
    return;
  }

  if ('error' in groupValidation) {
    res.status(400).json({ error: groupValidation.error });
    return;
  }

  const created = await prisma.transaction.create({
    data: {
      description,
      amount,
      category: groupValidation.category,
      month,
      status,
      groupId: groupValidation.groupId,
    },
  });
  res.status(201).json(created);
}));

app.put('/transactions/:id', asyncHandler(async (req, res) => {
  const description = parseRequiredText(req.body.description);
  const month = parseRequiredText(req.body.month);
  const status = parseRequiredText(req.body.status) ?? 'pending';
  const amount = parsePositiveAmount(req.body.amount);
  const groupValidation = await validateEntryGroupAndCategory(req.body.groupId, req.body.category, 'expense');

  if (!description || !month) {
    res.status(400).json({ error: 'Informe descrição e mês da despesa.' });
    return;
  }

  if (amount === null) {
    res.status(400).json({ error: 'O valor da despesa deve ser maior que zero.' });
    return;
  }

  if ('error' in groupValidation) {
    res.status(400).json({ error: groupValidation.error });
    return;
  }

  const updated = await prisma.transaction.update({
    where: { id: req.params.id },
    data: {
      description,
      amount,
      category: groupValidation.category,
      month,
      status,
      groupId: groupValidation.groupId,
    },
  });
  res.json(updated);
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
  const description = parseRequiredText(req.body.description);
  const amount = parsePositiveAmount(req.body.amount);
  const normalizedMonth = parseRequiredText(req.body.month);
  const groupValidation = await validateEntryGroupAndCategory(req.body.groupId, req.body.category, 'investment');

  if (!description) {
    res.status(400).json({ error: 'Informe a descrição do investimento.' });
    return;
  }

  if (amount === null) {
    res.status(400).json({ error: 'O valor do investimento deve ser maior que zero.' });
    return;
  }

  if (!normalizedMonth) {
    res.status(400).json({ error: 'Informe o mês do investimento.' });
    return;
  }

  if ('error' in groupValidation) {
    res.status(400).json({ error: groupValidation.error });
    return;
  }

  const newInv = await prisma.investment.create({
    data: {
      description,
      amount,
      category: groupValidation.category,
      month: normalizedMonth,
      groupId: groupValidation.groupId,
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
 * Corrige o valor de um aporte já registrado.
 * O patrimônio é ajustado apenas pela diferença entre o valor antigo e o novo.
 */
app.put('/investment-contributions/:id', asyncHandler(async (req, res) => {
  const amount = parsePositiveAmount(req.body.amount);

  if (amount === null) {
    res.status(400).json({ error: 'O valor do aporte deve ser maior que zero.' });
    return;
  }

  const existingContribution = await prisma.investmentContribution.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      amount: true,
      investmentId: true,
    },
  });

  if (!existingContribution) {
    res.status(404).json({ error: 'Aporte não encontrado.' });
    return;
  }

  const delta = amount - existingContribution.amount;

  const updatedInvestment = await prisma.$transaction(async (tx) => {
    await tx.investmentContribution.update({
      where: { id: existingContribution.id },
      data: { amount },
    });

    return tx.investment.update({
      where: { id: existingContribution.investmentId },
      data: {
        amount: { increment: delta },
      },
      include: investmentInclude,
    });
  });

  res.json(updatedInvestment);
}));

/**
 * Exclui um aporte e remove o mesmo valor do patrimônio acumulado.
 * O saldo do mês é recalculado pelo frontend a partir do histórico restante.
 */
app.delete('/investment-contributions/:id', asyncHandler(async (req, res) => {
  const existingContribution = await prisma.investmentContribution.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      amount: true,
      investmentId: true,
    },
  });

  if (!existingContribution) {
    res.status(404).json({ error: 'Aporte não encontrado.' });
    return;
  }

  const updatedInvestment = await prisma.$transaction(async (tx) => {
    await tx.investmentContribution.delete({
      where: { id: existingContribution.id },
    });

    return tx.investment.update({
      where: { id: existingContribution.investmentId },
      data: {
        amount: { decrement: existingContribution.amount },
      },
      include: investmentInclude,
    });
  });

  res.json(updatedInvestment);
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
