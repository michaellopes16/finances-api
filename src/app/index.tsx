import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { api } from '../services/api'

// --- Tipagens ---
type Group = { id: string; name: string; categories: string[]; type: string; }
type Transaction = { id: string; description: string; amount: number; category: string; groupId: string; month: string; status: 'paid' | 'pending'; }
type InvestmentContribution = { id: string; amount: number; month: string; note?: string | null; investmentId: string; createdAt: string; updatedAt: string; }
type Investment = { id: string; description: string; amount: number; category: string; groupId: string; month: string; historyInitialized: boolean; contributions: InvestmentContribution[]; }

// --- Temas e Cores ---
const darkTheme = { bg: '#121214', card: '#202024', border: '#323238', text: '#e1e1e6', subText: '#a8a8b3', primary: '#8257E5', success: '#04D361', danger: '#F75A68', info: '#00B37E', inputBg: '#121214', paidBg: 'rgba(4, 211, 97, 0.1)' }
const lightTheme = { bg: '#F0F4F8', card: '#FFFFFF', border: '#D9E2EC', text: '#102A43', subText: '#486581', primary: '#0F609B', success: '#0A7B3E', danger: '#D94430', info: '#0284C7', inputBg: '#F8FAFC', paidBg: '#E6F4EA' }
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MONTHS_LIST = Array.from({ length: 25 }, (_, index) => {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() - 12 + index, 1)
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
})
const CHART_COLORS = ['#8257E5', '#04D361', '#F75A68', '#00B37E', '#29B6F6', '#FBA94C', '#9C27B0', '#FFEB3B', '#E1E1E6']

// --- Componente: Gráfico de Pizza (Donut) ---
const DonutChart = ({ data, size = 120, strokeWidth = 20 }: { data: {name: string, value: number, color: string}[], size?: number, strokeWidth?: number }) => {
  const radius = (size - strokeWidth) / 2; const circumference = radius * 2 * Math.PI; const total = data.reduce((sum, item) => sum + item.value, 0); let cumulativePercent = 0;
  if (total === 0) return (<Svg width={size} height={size}><Circle cx={size/2} cy={size/2} r={radius} stroke="#323238" strokeWidth={strokeWidth} fill="transparent" /></Svg>)
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        {data.map((item, index) => {
          const percent = item.value / total; const strokeDasharray = `${percent * circumference} ${circumference}`; const strokeDashoffset = -(cumulativePercent * circumference); cumulativePercent += percent;
          return <Circle key={index} cx={size / 2} cy={size / 2} r={radius} stroke={item.color} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} fill="transparent" />
        })}
      </Svg>
    </View>
  )
}

export default function Dashboard() {
  // --- Estados Globais ---
  const [isDark, setIsDark] = useState(true)
  const theme = isDark ? darkTheme : lightTheme
  const [activeTab, setActiveTab] = useState<'incomes' | 'expenses' | 'investments'>('expenses')
  
  const [currentMonth, setCurrentMonth] = useState(() => {
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const d = new Date(); return `${months[d.getMonth()]} ${d.getFullYear()}`;
  })
  
  const [isMonthModalVisible, setIsMonthModalVisible] = useState(false)
  const [categoryModal, setCategoryModal] = useState<{visible: boolean, list: string[], onSelect: (c:string)=>void}>({visible: false, list: [], onSelect: ()=>{}})

  // --- Dados da API ---
  const [incomeGroups, setIncomeGroups] = useState<Group[]>([])
  const [expenseGroups, setExpenseGroups] = useState<Group[]>([])
  const [investmentGroups, setInvestmentGroups] = useState<Group[]>([])
  
  const [incomes, setIncomes] = useState<Transaction[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [investments, setInvestments] = useState<Investment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // --- Edição ---
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<any>>({})
  const [incrementValue, setIncrementValue] = useState<string>('')
  const [isSavingItem, setIsSavingItem] = useState(false)

  // --- Edição de aportes ---
  const [editingContributionId, setEditingContributionId] = useState<string | null>(null)
  const [editContributionValue, setEditContributionValue] = useState<string>('')
  const [savingContributionId, setSavingContributionId] = useState<string | null>(null)
  
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editGroupData, setEditGroupData] = useState<{name: string, categories: string, type: 'income'|'expense'|'investment'|null}>({name: '', categories: '', type: null})

  // ==========================================
  // CARREGAR DADOS DA API
  // ==========================================
  const loadData = async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      // Dispara as quatro requisições ao mesmo tempo. Isso reduz bastante
      // o tempo total quando o servidor está acordando ou tem latência alta.
      const [groupsResponse, incomesResponse, transactionsResponse, investmentsResponse] = await Promise.all([
        api.get('/groups'),
        api.get('/incomes', { params: { month: currentMonth } }),
        api.get('/transactions', { params: { month: currentMonth } }),
        api.get('/investments'),
      ])

      const groups: Group[] = groupsResponse.data
      setIncomeGroups(groups.filter((g) => g.type === 'income'))
      setExpenseGroups(groups.filter((g) => g.type === 'expense'))
      setInvestmentGroups(groups.filter((g) => g.type === 'investment'))
      setIncomes(incomesResponse.data)
      setTransactions(transactionsResponse.data)
      setInvestments(investmentsResponse.data)
    } catch (error) {
      console.error('Erro ao carregar dados da API:', error)
      setLoadError('Não foi possível carregar suas informações. Verifique a conexão e tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    setEditingId(null)
    setEditingGroupId(null)
    setIncrementValue('')
    setEditingContributionId(null)
    setEditContributionValue('')
  }, [currentMonth])

  // --- Filtros Mês ---
  const currentIncomes = useMemo(() => incomes.filter(i => i.month === currentMonth), [incomes, currentMonth])
  const currentTransactions = useMemo(() => transactions.filter(t => t.month === currentMonth), [transactions, currentMonth])

  // --- Cálculos Matemáticos ---
  const totalIncome = currentIncomes.reduce((acc, curr) => acc + curr.amount, 0);
  
  const { totalExpensesPaid, totalExpensesPending } = useMemo(() => {
    return currentTransactions.reduce((acc, curr) => {
      if (curr.status === 'paid') acc.totalExpensesPaid += curr.amount;
      if (curr.status === 'pending') acc.totalExpensesPending += curr.amount;
      return acc;
    }, { totalExpensesPaid: 0, totalExpensesPending: 0 });
  }, [currentTransactions]);

  const totalExpenses = totalExpensesPaid + totalExpensesPending;

  // Cada aporte possui seu próprio mês. Isso separa o patrimônio acumulado
  // do dinheiro efetivamente investido no mês selecionado.
  const monthlyInvestmentHistory = useMemo(() => {
    return investments
      .flatMap((investment) =>
        (investment.contributions ?? [])
          .filter((contribution) => contribution.month === currentMonth)
          .map((contribution) => ({
            ...contribution,
            investmentDescription: investment.description,
            investmentCategory: investment.category,
          })),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [investments, currentMonth])

  const totalInvestedThisMonth = monthlyInvestmentHistory.reduce((acc, contribution) => acc + contribution.amount, 0);

  // O saldo restante considera também todos os aportes feitos no mês atual.
  const balance = totalIncome - totalExpenses - totalInvestedThisMonth;
  const totalPatrimony = investments.reduce((acc, curr) => acc + curr.amount, 0);

  const paidPercentage = totalExpenses > 0 ? (totalExpensesPaid / totalExpenses) * 100 : 0;
  const pendingPercentage = totalExpenses > 0 ? (totalExpensesPending / totalExpenses) * 100 : 0;

  const formatCurrency = (val: number) => `R$ ${val.toFixed(2).replace('.', ',')}`

  const parseAmountInput = (rawValue: string) => {
    const cleanValue = rawValue.trim().replace(/R\$/gi, '').replace(/\s/g, '')
    if (!cleanValue) return NaN

    // Aceita 1234.56, 1234,56, 1.234,56 e 1,234.56.
    if (cleanValue.includes(',') && cleanValue.includes('.')) {
      const commaIsDecimal = cleanValue.lastIndexOf(',') > cleanValue.lastIndexOf('.')
      return Number(commaIsDecimal
        ? cleanValue.replace(/\./g, '').replace(',', '.')
        : cleanValue.replace(/,/g, ''))
    }

    if (cleanValue.includes(',')) {
      return Number(cleanValue.replace(/\./g, '').replace(',', '.'))
    }

    return Number(cleanValue.replace(/[^0-9.-]/g, ''))
  }

  // Gráficos
  const expenseChartData = useMemo(() => {
    const totals: Record<string, number> = {};
    currentTransactions.forEach(tx => totals[tx.category] = (totals[tx.category] || 0) + tx.amount);
    return Object.keys(totals).map((key, i) => ({ name: key, value: totals[key], color: CHART_COLORS[i % CHART_COLORS.length] })).sort((a,b) => b.value - a.value);
  }, [currentTransactions])

  const investmentChartData = useMemo(() => {
    const totals: Record<string, number> = {};
    investments.forEach(inv => totals[inv.category] = (totals[inv.category] || 0) + inv.amount);
    return Object.keys(totals).map((key, i) => ({ name: key, value: totals[key], color: CHART_COLORS[i % CHART_COLORS.length] })).sort((a,b) => b.value - a.value);
  }, [investments])


  // ==========================================
  // FUNÇÕES DE AÇÃO API (CRUD REAL)
  // ==========================================

  const handleReplicatePreviousMonth = async (typeKey: 'income' | 'expense') => {
    const currentIdx = MONTHS_LIST.indexOf(currentMonth);
    if (currentIdx <= 0) {
      Alert.alert("Aviso", "Não há mês anterior na lista para replicar.");
      return;
    }

    const prevMonth = MONTHS_LIST[currentIdx - 1];
    const endpoint = typeKey === 'income' ? '/incomes' : '/transactions';
    const setState: any = typeKey === 'income' ? setIncomes : setTransactions;

    try {
      // 1. Busca do mês passado
      const { data: prevItems } = await api.get(endpoint, { params: { month: prevMonth } });

      if (!prevItems || prevItems.length === 0) {
        Alert.alert("Aviso", `Nenhuma informação encontrada em ${prevMonth} para replicar.`);
        return;
      }

      // 2. Cria as novas transações baseadas no mês passado, mas para o mês atual
      const newItemsPromises = prevItems.map((item: any) => {
        const { id, createdAt, updatedAt, ...newItemData } = item; 
        return api.post(endpoint, {
          ...newItemData,
          month: currentMonth,
          status: 'pending' // Reinicia o status para Pendente / Receber / Pagar
        });
      });

      // 3. Aguarda todas as requisições finalizarem e atualiza a tela
      const responses = await Promise.all(newItemsPromises);
      const savedItems = responses.map(res => res.data);

      setState((prev: any) => [...prev, ...savedItems]);
      
    } catch (e) {
      console.error(`Erro ao replicar ${typeKey}`, e);
      Alert.alert("Erro", `Falha ao conectar com a API para replicar o mês de ${prevMonth}.`);
    }
  }

  const handleToggleStatus = async (id: string, typeKey: 'income'|'expense') => {
    const setState: any = typeKey === 'income' ? setIncomes : setTransactions;
    const endpoint = typeKey === 'income' ? '/incomes' : '/transactions';
    const list = typeKey === 'income' ? incomes : transactions;
    
    const item = list.find(i => i.id === id);
    if (!item) return;
    const newStatus = item.status === 'paid' ? 'pending' : 'paid';

    try {
      await api.patch(`${endpoint}/${id}/status`, { status: newStatus });
      setState((prev: any) => prev.map((i: any) => i.id === id ? { ...i, status: newStatus } : i));
    } catch (e) { console.error("Erro ao mudar status", e); }
  }

  const getGroupsByType = (typeKey: 'income'|'expense'|'investment') => {
    if (typeKey === 'income') return incomeGroups
    if (typeKey === 'expense') return expenseGroups
    return investmentGroups
  }

  const startNewItem = (group: Group, typeKey: 'income'|'expense'|'investment') => {
    const categories = (group.categories ?? []).map((c) => c.trim()).filter(Boolean)

    if (categories.length === 0) {
      Alert.alert(
        'Categoria necessária',
        'Este grupo não possui categorias. Edite o grupo e cadastre pelo menos uma categoria antes de adicionar um lançamento.',
      )
      return
    }

    setEditingId('new')
    setEditData({
      id: 'new',
      description: '',
      amount: '',
      category: categories[0],
      groupId: group.id,
      status: 'pending',
    })
  }

  const handleSaveItem = async (typeKey: 'income'|'expense'|'investment') => {
    if (isSavingItem) return

    const description = String(editData.description ?? '').trim()
    const amount = parseAmountInput(String(editData.amount ?? ''))
    const groupId = String(editData.groupId ?? '').trim()
    const groups = getGroupsByType(typeKey)
    const targetGroup = groups.find((group) => group.id === groupId)

    if (!description || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Dados incompletos', 'Informe uma descrição e um valor maior que zero.')
      return
    }

    if (!targetGroup) {
      Alert.alert('Grupo inválido', 'O grupo deste lançamento não existe mais. Cancele e adicione o lançamento novamente.')
      return
    }

    const validCategories = (targetGroup.categories ?? []).map((c) => c.trim()).filter(Boolean)
    if (validCategories.length === 0) {
      Alert.alert('Categoria necessária', 'Cadastre pelo menos uma categoria neste grupo antes de salvar o lançamento.')
      return
    }

    const requestedCategory = String(editData.category ?? '').trim()
    const category = validCategories.includes(requestedCategory)
      ? requestedCategory
      : validCategories[0]

    const setState: any = typeKey === 'income' ? setIncomes : typeKey === 'expense' ? setTransactions : setInvestments
    const endpoint = typeKey === 'income' ? '/incomes' : typeKey === 'expense' ? '/transactions' : '/investments'
    const payload = {
      description,
      amount,
      category,
      groupId,
      month: currentMonth,
      ...(typeKey !== 'investment' ? { status: editData.status ?? 'pending' } : {}),
    }

    setIsSavingItem(true)
    try {
      if (editingId === 'new') {
        const { data } = await api.post(endpoint, payload)
        setState((prev: any[]) => [...prev, data])
      } else if (editingId) {
        const { data } = await api.put(`${endpoint}/${editingId}`, payload)
        setState((prev: any[]) => prev.map((item) => item.id === editingId ? data : item))
      }
      setEditingId(null)
      setEditData({})
    } catch (e: any) {
      console.error('Erro ao salvar item:', e)
      const apiMessage = e?.response?.data?.error
      Alert.alert('Erro ao salvar', apiMessage || 'Não foi possível salvar a alteração no banco de dados.')
    } finally {
      setIsSavingItem(false)
    }
  }

  const handleSaveAporte = async (id: string) => {
    const amount = parseAmountInput(incrementValue)
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor de aporte maior que zero.')
      return
    }

    try {
      // O backend salva o aporte no histórico do mês selecionado e
      // incrementa o patrimônio acumulado de forma atômica no PostgreSQL.
      const { data } = await api.patch(`/investments/${id}/aporte`, {
        amount,
        month: currentMonth,
      })
      setInvestments((prev) => prev.map((inv) => inv.id === id ? data : inv))
      setEditingId(null)
      setIncrementValue('')
    } catch (e) {
      console.error('Erro ao salvar aporte:', e)
      Alert.alert('Erro', 'O aporte não pôde ser salvo no banco de dados.')
    }
  }


  const handleStartEditContribution = (contribution: InvestmentContribution) => {
    setEditingContributionId(contribution.id)
    setEditContributionValue(String(contribution.amount).replace('.', ','))
  }

  const handleCancelEditContribution = () => {
    setEditingContributionId(null)
    setEditContributionValue('')
  }

  const handleSaveContribution = async (contribution: InvestmentContribution) => {
    const amount = parseAmountInput(editContributionValue)

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor de aporte maior que zero.')
      return
    }

    setSavingContributionId(contribution.id)

    try {
      const { data: updatedInvestment } = await api.put(
        `/investment-contributions/${contribution.id}`,
        { amount },
      )

      setInvestments((prev) =>
        prev.map((investment) =>
          investment.id === updatedInvestment.id ? updatedInvestment : investment,
        ),
      )

      setEditingContributionId(null)
      setEditContributionValue('')
    } catch (e) {
      console.error('Erro ao editar aporte:', e)
      Alert.alert('Erro', 'Não foi possível editar o aporte.')
    } finally {
      setSavingContributionId(null)
    }
  }

  const deleteContribution = async (contribution: InvestmentContribution) => {
    setSavingContributionId(contribution.id)

    try {
      const { data: updatedInvestment } = await api.delete(
        `/investment-contributions/${contribution.id}`,
      )

      setInvestments((prev) =>
        prev.map((investment) =>
          investment.id === updatedInvestment.id ? updatedInvestment : investment,
        ),
      )

      if (editingContributionId === contribution.id) {
        setEditingContributionId(null)
        setEditContributionValue('')
      }
    } catch (e: any) {
      console.error('Erro ao excluir aporte:', e)
      const apiMessage = e?.response?.data?.error
      Alert.alert('Erro ao excluir', apiMessage || 'Não foi possível excluir o aporte.')
    } finally {
      setSavingContributionId(null)
    }
  }

  const handleDeleteContribution = (contribution: InvestmentContribution) => {
    const message = `Deseja excluir o aporte de ${formatCurrency(contribution.amount)}? O valor será devolvido ao saldo do mês e removido do patrimônio.`

    // No React Native Web, Alert.alert não executa de forma confiável
    // callbacks de múltiplos botões. Por isso usamos confirm() no navegador.
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm(message) : false
      if (confirmed) void deleteContribution(contribution)
      return
    }

    Alert.alert(
      'Excluir aporte',
      message,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => void deleteContribution(contribution),
        },
      ],
    )
  }

  const handleRemoveItem = async (id: string, typeKey: 'income'|'expense'|'investment') => {
    const setState: any = typeKey === 'income' ? setIncomes : typeKey === 'expense' ? setTransactions : setInvestments;
    const endpoint = typeKey === 'income' ? '/incomes' : typeKey === 'expense' ? '/transactions' : '/investments';
    
    try {
      await api.delete(`${endpoint}/${id}`);
      setState((prev: any) => prev.filter((item: any) => item.id !== id));
      setEditingId(null);
    } catch (e) { console.error("Erro ao remover", e); }
  }

  const saveEditGroup = async (groupId: string) => {
    const categories = Array.from(new Set(
      editGroupData.categories
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ))

    if (!editGroupData.type) return

    if (categories.length === 0) {
      Alert.alert('Categoria necessária', 'Mantenha pelo menos uma categoria no grupo.')
      return
    }

    const setState: any = editGroupData.type === 'income' ? setIncomeGroups : editGroupData.type === 'expense' ? setExpenseGroups : setInvestmentGroups

    try {
      let savedGroup: Group

      if (groupId === 'new') {
        const { data } = await api.post('/groups', {
          name: editGroupData.name || 'Novo Grupo',
          type: editGroupData.type,
          categories,
        })
        savedGroup = data
        setState((prev: Group[]) => [...prev, data])
      } else {
        const { data } = await api.put(`/groups/${groupId}`, {
          name: editGroupData.name || 'Grupo',
          categories,
        })
        savedGroup = data
        setState((prev: Group[]) => prev.map((g) => g.id === groupId ? data : g))
      }

      // Se havia um lançamento em edição e sua categoria foi removida,
      // move o rascunho para a primeira categoria ainda válida.
      if (editData.groupId === savedGroup.id && !savedGroup.categories.includes(String(editData.category ?? ''))) {
        setEditData((prev: any) => ({ ...prev, category: savedGroup.categories[0] }))
      }

      setEditingGroupId(null)
    } catch (e: any) {
      console.error('Erro ao salvar grupo', e)
      const apiMessage = e?.response?.data?.error
      Alert.alert('Erro', apiMessage || 'Não foi possível salvar o grupo no banco de dados.')
    }
  }

  const removeGroup = async (groupId: string, typeKey: 'income'|'expense'|'investment') => {
    try {
      await api.delete(`/groups/${groupId}`);
      if (typeKey === 'income') { setIncomeGroups(prev => prev.filter(g => g.id !== groupId)); setIncomes(prev => prev.filter(i => i.groupId !== groupId)); }
      else if (typeKey === 'expense') { setExpenseGroups(prev => prev.filter(g => g.id !== groupId)); setTransactions(prev => prev.filter(tx => tx.groupId !== groupId)); }
      else { setInvestmentGroups(prev => prev.filter(g => g.id !== groupId)); setInvestments(prev => prev.filter(inv => inv.groupId !== groupId)); }
      setEditingGroupId(null);
    } catch (e) { console.error("Erro ao remover grupo", e); }
  }


  // --- Renderização de Tabela Dinâmica ---
  const renderGroup = (group: Group, typeKey: 'income'|'expense'|'investment') => {
    const list = typeKey === 'income' ? currentIncomes.filter(t => t.groupId === group.id) : typeKey === 'expense' ? currentTransactions.filter(t => t.groupId === group.id) : investments.filter(i => i.groupId === group.id);
    const totalGroup = list.reduce((acc, curr) => acc + curr.amount, 0);
    const isEditingGroup = editingGroupId === group.id;

    if (editingId === 'new' && editData.groupId === group.id) list.push(editData as any);

    return (
      <View key={group.id} style={[styles.cardBase, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 24 }]}>
        <View style={styles.tableHeaderSection}>
          {isEditingGroup ? (
            <View style={{ flex: 1, paddingRight: 16 }}>
              <TextInput style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg, borderBottomColor: theme.primary, marginBottom: 8 }]} value={editGroupData.name} onChangeText={(v) => setEditGroupData({...editGroupData, name: v})} placeholder="Nome do Grupo" placeholderTextColor={theme.subText} autoFocus />
              <TextInput style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg, borderBottomColor: theme.primary, fontSize: 13 }]} value={editGroupData.categories} onChangeText={(v) => setEditGroupData({...editGroupData, categories: v})} placeholder="Categorias (vírgula)" placeholderTextColor={theme.subText} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: theme.primary }]} onPress={() => saveEditGroup(group.id)}><Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>✓ Salvar</Text></TouchableOpacity>
                {group.id !== 'new' && <TouchableOpacity style={[styles.smallBtn, { backgroundColor: theme.danger }]} onPress={() => removeGroup(group.id, typeKey)}><Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>✕ Apagar</Text></TouchableOpacity>}
              </View>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.titleText, { color: theme.text }]}>{group.name}</Text>
                <TouchableOpacity onPress={() => { setEditingGroupId(group.id); setEditGroupData({ name: group.name, categories: group.categories.join(', '), type: typeKey })}}><Text style={{ color: theme.subText, fontSize: 14 }}>✎</Text></TouchableOpacity>
              </View>
              <Text style={[{ color: typeKey === 'income' ? theme.success : theme.subText, fontSize: 16, fontWeight: 'bold' }]}>{typeKey === 'income' ? '+ ' : ''}{formatCurrency(totalGroup)}</Text>
            </>
          )}
        </View>

        {!isEditingGroup && (
          <View style={[styles.tableHeaderRow, { borderBottomColor: theme.border }]}>
            <Text style={[styles.headerText, { color: theme.subText, flex: 2 }]}>DESCRIÇÃO</Text>
            <Text style={[styles.headerText, { color: theme.subText, flex: 1.2 }]}>CATEGORIA</Text>
            <Text style={[styles.headerText, { color: theme.subText, width: 90, textAlign: 'right' }]}>{typeKey === 'investment' ? 'ACUMULADO' : 'VALOR'}</Text>
            <Text style={[styles.headerText, { color: theme.subText, width: 85, textAlign: 'center' }]}>AÇÃO</Text>
          </View>
        )}

        {!isEditingGroup && list.map((item: any) => {
          const isEditing = editingId === item.id;
          const isPaid = (typeKey !== 'investment') ? (item.status === 'paid' && !isEditing) : false;

          return (
            <View key={item.id} style={[styles.row, { borderBottomColor: theme.border }]}>
              {isEditing ? (
                <View style={{ flex: 1, paddingVertical: 6, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  {(editingId === 'new' || typeKey !== 'investment') ? (
                    <>
                      <TextInput style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg, borderBottomColor: theme.primary, flex: 2 }]} value={editData.description} onChangeText={(v) => setEditData({...editData, description: v})} placeholder="Descrição" autoFocus />
                      <View style={{ flex: 1.2 }}>
                        <TouchableOpacity style={[styles.comboboxBtn, { borderColor: theme.primary, backgroundColor: theme.inputBg }]} onPress={() => setCategoryModal({visible: true, list: group.categories, onSelect: (cat) => setEditData((prev: any) => ({...prev, category: cat}))})}>
                          <Text style={{ color: theme.text, fontSize: 13 }} numberOfLines={1}>{editData.category || 'Selecionar...'}</Text><Text style={{ color: theme.subText, fontSize: 10 }}>▼</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg, borderBottomColor: theme.primary, width: 90, textAlign: 'right' }]} value={editData.amount?.toString()} onChangeText={(v) => setEditData({...editData, amount: v})} keyboardType="decimal-pad" placeholder="0.00" />
                      <View style={{ width: 85, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
                        <TouchableOpacity style={[styles.smallBtn, { backgroundColor: theme.primary, paddingHorizontal: 8, minWidth: 34, alignItems: 'center' }]} onPress={() => handleSaveItem(typeKey)} disabled={isSavingItem}>{isSavingItem ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}</TouchableOpacity>
                        {editingId !== 'new' && (
                          <TouchableOpacity style={[styles.smallBtn, { backgroundColor: theme.danger, paddingHorizontal: 8 }]} onPress={() => handleRemoveItem(item.id, typeKey)}><Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✕</Text></TouchableOpacity>
                        )}
                      </View>
                    </>
                  ) : (
                    // MODO APORTE INVESTIMENTOS
                    <>
                      <Text style={{ color: theme.text, flex: 2, fontSize: 15 }} numberOfLines={1}>{item.description}</Text>
                      <Text style={{ color: theme.subText, flex: 1.2, fontSize: 13 }} numberOfLines={1}>{item.category}</Text>
                      <TextInput style={[styles.input, { color: theme.info, backgroundColor: theme.inputBg, borderBottomColor: theme.info, width: 90, textAlign: 'right', fontWeight: 'bold' }]} value={incrementValue} onChangeText={setIncrementValue} keyboardType="decimal-pad" placeholder="+ Aporte" placeholderTextColor={theme.info} autoFocus />
                      <View style={{ width: 85, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
                        <TouchableOpacity style={[styles.smallBtn, { backgroundColor: theme.info, paddingHorizontal: 8 }]} onPress={() => handleSaveAporte(item.id)}><Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.smallBtn, { backgroundColor: theme.danger, paddingHorizontal: 8 }]} onPress={() => { setEditingId(null); setIncrementValue(''); }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✕</Text></TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              ) : (
                <>
                  <View style={{ flex: 2, paddingRight: 8, justifyContent: 'center' }}><Pressable onPress={() => typeKey !== 'investment' && (setEditingId(item.id), setEditData(item))}><Text style={[{ color: theme.text, fontSize: 15 }, isPaid && styles.strikethrough]}>{item.description}</Text></Pressable></View>
                  <View style={{ flex: 1.2, justifyContent: 'center' }}><View style={[styles.categoryBadge, { backgroundColor: isDark ? 'rgba(130, 87, 229, 0.15)' : 'rgba(15, 96, 155, 0.1)' }]}><Text style={{ color: theme.primary, fontSize: 11, fontWeight: 'bold' }}>{item.category}</Text></View></View>
                  <View style={{ width: 90, justifyContent: 'center' }}><Text style={[{ color: typeKey === 'income' ? theme.success : theme.text, textAlign: 'right', fontWeight: 'bold' }, isPaid && styles.strikethrough]}>{formatCurrency(item.amount)}</Text></View>
                  <View style={{ width: 85, alignItems: 'center', justifyContent: 'center', paddingLeft: 8 }}>
                    {typeKey !== 'investment' ? (
                      <TouchableOpacity style={[styles.actionButton, isPaid ? { backgroundColor: theme.paidBg, borderColor: theme.success } : { borderColor: typeKey === 'income' ? theme.success : theme.danger }]} onPress={() => handleToggleStatus(item.id, typeKey)}>
                        <Text style={[{ fontSize: 13, fontWeight: 'bold' }, { color: isPaid ? theme.success : (typeKey === 'income' ? theme.success : theme.danger) }]}>{isPaid ? 'Recebido' : (typeKey === 'income' ? 'Receber' : 'Pagar')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.actionButton, { borderColor: theme.info, backgroundColor: isDark ? 'rgba(0, 179, 126, 0.1)' : '#E6F4EA' }]} onPress={() => { setEditingId(item.id); setIncrementValue(''); }}><Text style={{ color: theme.info, fontSize: 13, fontWeight: 'bold' }}>+ Aporte</Text></TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </View>
          )
        })}
        
        {!isEditingGroup && editingId !== 'new' && (
          <TouchableOpacity style={{ marginTop: 16, alignItems: 'center', paddingVertical: 8 }} onPress={() => startNewItem(group, typeKey)}>
            <Text style={{ color: theme.primary, fontWeight: 'bold' }}>+ Adicionar em {group.name}</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingTitle, { color: theme.text }]}>Carregando suas finanças...</Text>
        <Text style={[styles.loadingSubtitle, { color: theme.subText }]}>O primeiro acesso pode levar alguns segundos.</Text>
      </View>
    )
  }

  if (loadError) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.danger, fontSize: 32, marginBottom: 12 }}>!</Text>
        <Text style={[styles.loadingTitle, { color: theme.text }]}>Falha ao carregar</Text>
        <Text style={[styles.loadingSubtitle, { color: theme.subText }]}>{loadError}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: theme.primary }]}
          onPress={loadData}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.inner}>
          
          {/* Header */}
          <View style={styles.header}>
            <View><Text style={{ color: theme.subText, fontSize: 14 }}>Visão Geral</Text><Text style={{ color: theme.text, fontSize: 26, fontWeight: 'bold' }}>Meu Painel</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity onPress={() => setIsDark(!isDark)} style={[styles.cardBase, { padding: 8, backgroundColor: theme.card, borderColor: theme.border }]}><Text style={{ color: theme.text, fontSize: 16 }}>{isDark ? '◐' : '◑'}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.cardBase, { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setIsMonthModalVisible(true)}><Text style={{ color: theme.primary, fontWeight: '600' }}>{currentMonth} ▾</Text></TouchableOpacity>
            </View>
          </View>

          {/* 4 Cards de Resumo */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <View style={[styles.cardBase, { flex: 1, minWidth: 150, padding: 16, backgroundColor: theme.card, borderColor: theme.border, borderTopWidth: 4, borderTopColor: theme.success, flexDirection: 'row', justifyContent: 'space-between' }]}>
              <View><Text style={{ color: theme.subText, fontSize: 13, marginBottom: 4 }}>RECEITAS (MÊS)</Text><Text style={{ color: theme.text, fontSize: 20, fontWeight: 'bold' }}>{formatCurrency(totalIncome)}</Text></View><Text style={{ fontSize: 24, color: theme.success }}>▲</Text>
            </View>
            <View style={[styles.cardBase, { flex: 1, minWidth: 150, padding: 16, backgroundColor: theme.card, borderColor: theme.border, borderTopWidth: 4, borderTopColor: theme.danger, flexDirection: 'row', justifyContent: 'space-between' }]}>
              <View><Text style={{ color: theme.subText, fontSize: 13, marginBottom: 4 }}>DESPESAS (MÊS)</Text><Text style={{ color: theme.text, fontSize: 20, fontWeight: 'bold' }}>{formatCurrency(totalExpenses)}</Text></View><Text style={{ fontSize: 22, color: theme.danger }}>▼</Text>
            </View>
            <View style={[styles.cardBase, { flex: 1, minWidth: 150, padding: 16, backgroundColor: theme.card, borderColor: theme.border, borderTopWidth: 4, borderTopColor: theme.primary, flexDirection: 'row', justifyContent: 'space-between' }]}>
              <View><Text style={{ color: theme.subText, fontSize: 13, marginBottom: 4 }}>SALDO RESTANTE</Text><Text style={{ color: theme.text, fontSize: 22, fontWeight: 'bold' }}>{formatCurrency(balance)}</Text></View><Text style={{ fontSize: 22, color: theme.primary }}>❖</Text>
            </View>
            <View style={[styles.cardBase, { flex: 1, minWidth: 150, padding: 16, backgroundColor: theme.card, borderColor: theme.border, borderTopWidth: 4, borderTopColor: theme.info, flexDirection: 'row', justifyContent: 'space-between' }]}>
              <View><Text style={{ color: theme.subText, fontSize: 13, marginBottom: 4 }}>PATRIMÔNIO GLOBAL</Text><Text style={{ color: theme.text, fontSize: 20, fontWeight: 'bold' }}>{formatCurrency(totalPatrimony)}</Text></View><Text style={{ fontSize: 22, color: theme.info }}>↗</Text>
            </View>
          </View>

          {/* Seletor de 3 Abas */}
          <View style={{ flexDirection: 'row', marginBottom: 24, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <TouchableOpacity style={[styles.tabButton, activeTab === 'incomes' && { borderBottomColor: theme.primary }]} onPress={() => setActiveTab('incomes')}>
              <Text style={[{ fontSize: 16, fontWeight: 'bold' }, activeTab === 'incomes' ? { color: theme.text } : { color: theme.subText }]}>Receitas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabButton, activeTab === 'expenses' && { borderBottomColor: theme.primary }]} onPress={() => setActiveTab('expenses')}>
              <Text style={[{ fontSize: 16, fontWeight: 'bold' }, activeTab === 'expenses' ? { color: theme.text } : { color: theme.subText }]}>Despesas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabButton, activeTab === 'investments' && { borderBottomColor: theme.primary }]} onPress={() => setActiveTab('investments')}>
              <Text style={[{ fontSize: 16, fontWeight: 'bold' }, activeTab === 'investments' ? { color: theme.text } : { color: theme.subText }]}>Investimentos</Text>
            </TouchableOpacity>
          </View>

          {/* CONTEÚDO DAS ABAS */}
          
          {activeTab === 'incomes' && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 }}>
                 <TouchableOpacity style={[styles.cardBase, { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.card, borderColor: theme.primary, flexDirection: 'row', alignItems: 'center' }]} onPress={() => handleReplicatePreviousMonth('income')}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold' }}>⟳ Puxar do mês anterior</Text>
                 </TouchableOpacity>
              </View>

              {incomeGroups.map(group => renderGroup(group, 'income'))}
              {editingGroupId === 'new' && editGroupData.type === 'income' && renderGroup({ id: 'new', name: '', categories: [], type: 'income' }, 'income')}
              <TouchableOpacity style={[styles.cardBase, { padding: 16, alignItems: 'center', borderColor: theme.primary, borderStyle: 'dashed' }]} onPress={() => { setEditingGroupId('new'); setEditGroupData({ name: '', categories: 'Geral', type: 'income' }); }}>
                <Text style={{ color: theme.primary, fontWeight: 'bold' }}>+ Novo Grupo de Receitas</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'expenses' && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 }}>
                 <TouchableOpacity style={[styles.cardBase, { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.card, borderColor: theme.primary, flexDirection: 'row', alignItems: 'center' }]} onPress={() => handleReplicatePreviousMonth('expense')}>
                    <Text style={{ color: theme.primary, fontWeight: 'bold' }}>⟳ Puxar do mês anterior</Text>
                 </TouchableOpacity>
              </View>

              <View style={[styles.cardBase, { padding: 20, marginBottom: 24, backgroundColor: theme.card, borderColor: theme.border, flexDirection: 'row', flexWrap: 'wrap', gap: 24 }]}>
                <View style={{ flex: 1, minWidth: 250, justifyContent: 'center' }}>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: 'bold', marginBottom: 16 }}>Acompanhamento</Text>
                  <View style={{ height: 8, flexDirection: 'row', borderRadius: 4, overflow: 'hidden', marginBottom: 16, backgroundColor: theme.border }}>
                    <View style={{ height: '100%', width: `${paidPercentage}%`, backgroundColor: theme.success }} /><View style={{ height: '100%', width: `${pendingPercentage}%`, backgroundColor: theme.danger }} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.success }} /><View><Text style={{ color: theme.subText, fontSize: 12 }}>Já Pago</Text><Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 14 }}>{formatCurrency(totalExpensesPaid)}</Text></View></View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.danger }} /><View><Text style={{ color: theme.subText, fontSize: 12 }}>Pendente</Text><Text style={{ color: theme.text, fontWeight: 'bold', fontSize: 14 }}>{formatCurrency(totalExpensesPending)}</Text></View></View>
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 250, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                   <DonutChart data={expenseChartData} size={110} strokeWidth={16} />
                   <View style={{ justifyContent: 'center' }}>
                     {expenseChartData.slice(0,4).map((d, i) => (<View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: d.color }} /><Text style={{ color: theme.text, fontSize: 12 }} numberOfLines={1}>{d.name}</Text></View>))}
                   </View>
                </View>
              </View>
              {expenseGroups.map(group => renderGroup(group, 'expense'))}
              {editingGroupId === 'new' && editGroupData.type === 'expense' && renderGroup({ id: 'new', name: '', categories: [], type: 'expense' }, 'expense')}
              <TouchableOpacity style={[styles.cardBase, { padding: 16, alignItems: 'center', borderColor: theme.primary, borderStyle: 'dashed' }]} onPress={() => { setEditingGroupId('new'); setEditGroupData({ name: '', categories: 'Geral', type: 'expense' }); }}><Text style={{ color: theme.primary, fontWeight: 'bold' }}>+ Novo Grupo de Despesas</Text></TouchableOpacity>
            </View>
          )}

          {activeTab === 'investments' && (
            <View>
              <View style={[styles.cardBase, { padding: 20, marginBottom: 24, backgroundColor: theme.card, borderColor: theme.border, flexDirection: 'row', flexWrap: 'wrap', gap: 24 }]}>
                <View style={{ flex: 1, minWidth: 250, justifyContent: 'center' }}>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Carteira Global</Text>
                  <Text style={{ color: theme.subText, fontSize: 14, marginBottom: 14 }}>Visão acumulativa por categoria.</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    <View style={[styles.investmentMetric, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                      <Text style={{ color: theme.subText, fontSize: 11, fontWeight: 'bold' }}>PATRIMÔNIO</Text>
                      <Text style={{ color: theme.info, fontSize: 18, fontWeight: 'bold', marginTop: 4 }}>{formatCurrency(totalPatrimony)}</Text>
                    </View>
                    <View style={[styles.investmentMetric, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                      <Text style={{ color: theme.subText, fontSize: 11, fontWeight: 'bold' }}>APORTADO EM {currentMonth.toUpperCase()}</Text>
                      <Text style={{ color: theme.primary, fontSize: 18, fontWeight: 'bold', marginTop: 4 }}>{formatCurrency(totalInvestedThisMonth)}</Text>
                    </View>
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 250, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                   <DonutChart data={investmentChartData} size={110} strokeWidth={16} />
                   <View style={{ justifyContent: 'center' }}>{investmentChartData.slice(0,4).map((d, i) => (<View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: d.color }} /><Text style={{ color: theme.text, fontSize: 12 }} numberOfLines={1}>{d.name}</Text></View>))}</View>
                </View>
              </View>

              <View style={[styles.cardBase, { marginBottom: 24, backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: 'bold' }}>Aportes de {currentMonth}</Text>
                  <Text style={{ color: theme.subText, fontSize: 13, marginTop: 4 }}>
                    Estes valores são descontados do saldo restante deste mês.
                  </Text>
                </View>

                {monthlyInvestmentHistory.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: theme.subText, textAlign: 'center' }}>Nenhum aporte registrado neste mês.</Text>
                  </View>
                ) : (
                  monthlyInvestmentHistory.map((contribution) => {
                    const isEditingContribution = editingContributionId === contribution.id
                    const isSavingContribution = savingContributionId === contribution.id

                    return (
                      <View key={contribution.id} style={[styles.contributionRow, { borderBottomColor: theme.border }]}>
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>{contribution.investmentDescription}</Text>
                          <Text style={{ color: theme.subText, fontSize: 12, marginTop: 3 }}>{contribution.investmentCategory}{contribution.note ? ` • ${contribution.note}` : ''}</Text>
                        </View>

                        {isEditingContribution ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TextInput
                              style={[
                                styles.input,
                                {
                                  color: theme.text,
                                  backgroundColor: theme.inputBg,
                                  borderBottomColor: theme.primary,
                                  width: 105,
                                  textAlign: 'right',
                                  paddingVertical: 6,
                                },
                              ]}
                              value={editContributionValue}
                              onChangeText={setEditContributionValue}
                              keyboardType="decimal-pad"
                              placeholder="0,00"
                              placeholderTextColor={theme.subText}
                              autoFocus
                              editable={!isSavingContribution}
                            />

                            <TouchableOpacity
                              style={[styles.smallBtn, { backgroundColor: theme.success, paddingHorizontal: 9 }]}
                              onPress={() => handleSaveContribution(contribution)}
                              disabled={isSavingContribution}
                            >
                              {isSavingContribution
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>✓</Text>}
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.smallBtn, { backgroundColor: theme.border, paddingHorizontal: 9 }]}
                              onPress={handleCancelEditContribution}
                              disabled={isSavingContribution}
                            >
                              <Text style={{ color: theme.text, fontSize: 12, fontWeight: 'bold' }}>✕</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: theme.info, fontSize: 15, fontWeight: 'bold' }}>- {formatCurrency(contribution.amount)}</Text>

                            <TouchableOpacity
                              style={[styles.contributionActionButton, { borderColor: theme.primary }]}
                              onPress={() => handleStartEditContribution(contribution)}
                              disabled={isSavingContribution}
                            >
                              <Text style={{ color: theme.primary, fontSize: 13, fontWeight: 'bold' }}>✎</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.contributionActionButton, { borderColor: theme.danger }]}
                              onPress={() => handleDeleteContribution(contribution)}
                              disabled={isSavingContribution}
                            >
                              {isSavingContribution
                                ? <ActivityIndicator size="small" color={theme.danger} />
                                : <Text style={{ color: theme.danger, fontSize: 13, fontWeight: 'bold' }}>🗑</Text>}
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )
                  })
                )}

                <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: theme.subText, fontSize: 13, fontWeight: 'bold' }}>TOTAL APORTADO NO MÊS</Text>
                  <Text style={{ color: theme.primary, fontSize: 16, fontWeight: 'bold' }}>{formatCurrency(totalInvestedThisMonth)}</Text>
                </View>
              </View>

              {investmentGroups.map(group => renderGroup(group, 'investment'))}
              {editingGroupId === 'new' && editGroupData.type === 'investment' && renderGroup({ id: 'new', name: '', categories: [], type: 'investment' }, 'investment')}
              <TouchableOpacity style={[styles.cardBase, { padding: 16, alignItems: 'center', borderColor: theme.primary, borderStyle: 'dashed' }]} onPress={() => { setEditingGroupId('new'); setEditGroupData({ name: '', categories: 'Geral', type: 'investment' }); }}><Text style={{ color: theme.primary, fontWeight: 'bold' }}>+ Novo Grupo de Investimentos</Text></TouchableOpacity>
            </View>
          )}

        </View>
      </ScrollView>

      {/* Modal Combobox */}
      <Modal visible={categoryModal.visible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCategoryModal({...categoryModal, visible: false})}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border, padding: 0 }]}><Text style={{ color: theme.subText, padding: 16, fontWeight: 'bold', borderBottomWidth: 1, borderBottomColor: theme.border }}>Selecione a Categoria</Text>{categoryModal.list.map(cat => (<TouchableOpacity key={cat} style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border }} onPress={() => { categoryModal.onSelect(cat); setCategoryModal({...categoryModal, visible: false}) }}><Text style={{ color: theme.text, fontSize: 15 }}>{cat}</Text></TouchableOpacity>))}</View>
        </TouchableOpacity>
      </Modal>

      {/* Modal Mês */}
      <Modal visible={isMonthModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={{ color: theme.text, fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' }}>Selecionar Mês</Text>{MONTHS_LIST.map(month => (<TouchableOpacity key={month} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }} onPress={() => { setCurrentMonth(month); setIsMonthModalVisible(false); }}><Text style={{ color: currentMonth === month ? theme.primary : theme.text, fontSize: 16, textAlign: 'center', fontWeight: currentMonth === month ? 'bold' : 'normal' }}>{month}</Text></TouchableOpacity>))}<TouchableOpacity style={{ marginTop: 16, padding: 12, backgroundColor: theme.inputBg, borderRadius: 8 }} onPress={() => setIsMonthModalVisible(false)}><Text style={{ color: theme.text, textAlign: 'center', fontWeight: 'bold' }}>Cancelar</Text></TouchableOpacity></View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  contentContainer: { padding: 16, paddingTop: 32, paddingBottom: 64 }, inner: { maxWidth: 900, width: '100%', alignSelf: 'center' }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }, cardBase: { borderWidth: 1, borderRadius: 8 }, titleText: { fontSize: 18, fontWeight: 'bold' }, tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tableHeaderSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: 16, paddingBottom: 0 }, tableHeaderRow: { flexDirection: 'row', paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1 }, headerText: { fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }, row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 }, strikethrough: { textDecorationLine: 'line-through', opacity: 0.5 },
  input: { paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, fontSize: 15 }, comboboxBtn: { paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderRadius: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, categoryBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, width: '100%', alignItems: 'center' }, smallBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 }, modalContent: { width: '100%', maxWidth: 400, borderWidth: 1, borderRadius: 12, padding: 24 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingTitle: { marginTop: 16, fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  loadingSubtitle: { marginTop: 8, fontSize: 14, textAlign: 'center', maxWidth: 360 },
  retryButton: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  investmentMetric: { minWidth: 175, flexGrow: 1, padding: 12, borderWidth: 1, borderRadius: 8 },
  contributionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  contributionActionButton: { width: 30, height: 30, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
})