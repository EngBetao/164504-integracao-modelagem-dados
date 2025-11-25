// src/server.js
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const bodyParser = require('body-parser');

// === 1. CONFIGURAÇÃO DO BANCO DE DADOS (SQLite) ===
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite', // O arquivo do banco será criado na raiz
  logging: false, // Desliga logs excessivos no terminal
});

// === 2. MODELAGEM DOS DADOS (Etapa 01 do Desafio) ===

// Modelo: Cliente
const Cliente = sequelize.define('Cliente', {
  nome: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  cpf: { type: DataTypes.STRING, allowNull: false }
});

// Modelo: Produto
const Produto = sequelize.define('Produto', {
  nome: { type: DataTypes.STRING, allowNull: false },
  descricao: { type: DataTypes.STRING },
  preco: { type: DataTypes.FLOAT, allowNull: false },
  estoque: { type: DataTypes.INTEGER, defaultValue: 0 }
});

// Modelo: Venda
const Venda = sequelize.define('Venda', {
  data_venda: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  total: { type: DataTypes.FLOAT, defaultValue: 0.0 }
});

// Modelo: ItemVenda (Tabela Pivô para relação N:N)
const ItemVenda = sequelize.define('ItemVenda', {
  quantidade: { type: DataTypes.INTEGER, allowNull: false },
  preco_unitario: { type: DataTypes.FLOAT, allowNull: false }
});

// === 3. RELACIONAMENTOS ===
// Um Cliente tem muitas Vendas
Cliente.hasMany(Venda);
Venda.belongsTo(Cliente);

// Uma Venda tem muitos Produtos (através de ItemVenda)
Venda.belongsToMany(Produto, { through: ItemVenda });
Produto.belongsToMany(Venda, { through: ItemVenda });

// === 4. INICIALIZAÇÃO DO APP EXPRESS ===
const app = express();
app.use(cors());
app.use(bodyParser.json());

// === 5. ROTAS DA API (Etapa 02 do Desafio) ===

// Rota de Teste
app.get('/', (req, res) => {
  res.send({ message: 'API DNCommerce rodando! 🚀' });
});

// --- CRUD PRODUTOS ---
app.post('/produtos', async (req, res) => {
  try {
    const produto = await Produto.create(req.body);
    res.status(201).json(produto);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/produtos', async (req, res) => {
  const produtos = await Produto.findAll();
  res.json(produtos);
});

// --- CRUD CLIENTES ---
app.post('/clientes', async (req, res) => {
  try {
    const cliente = await Cliente.create(req.body);
    res.status(201).json(cliente);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/clientes', async (req, res) => {
  const clientes = await Cliente.findAll();
  res.json(clientes);
});

// --- REGISTRO DE VENDAS (A Lógica Complexa) ---
app.post('/vendas', async (req, res) => {
  /* Esperamos um JSON assim:
    {
      "ClienteId": 1,
      "itens": [
        { "ProdutoId": 1, "quantidade": 2 },
        { "ProdutoId": 2, "quantidade": 1 }
      ]
    }
  */
  try {
    const { ClienteId, itens } = req.body;

    // 1. Cria a venda vazia
    const venda = await Venda.create({ ClienteId });
    let totalVenda = 0;

    // 2. Processa cada item
    for (const item of itens) {
      const produto = await Produto.findByPk(item.ProdutoId);
      if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
      
      // Verifica estoque
      if (produto.estoque < item.quantidade) {
        return res.status(400).json({ error: `Estoque insuficiente para ${produto.nome}` });
      }

      // Adiciona o item à venda
      await venda.addProduto(produto, { 
        through: { 
          quantidade: item.quantidade, 
          preco_unitario: produto.preco 
        } 
      });

      // Atualiza estoque e total
      await produto.update({ estoque: produto.estoque - item.quantidade });
      totalVenda += produto.preco * item.quantidade;
    }

    // 3. Atualiza o total final da venda
    await venda.update({ total: totalVenda });

    // 4. Busca a venda completa para retornar
    const vendaCompleta = await Venda.findByPk(venda.id, {
      include: [
        { model: Cliente },
        { model: Produto, through: { attributes: ['quantidade', 'preco_unitario'] } }
      ]
    });

    res.status(201).json(vendaCompleta);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao processar venda' });
  }
});

app.get('/vendas', async (req, res) => {
  const vendas = await Venda.findAll({
    include: [Cliente, Produto]
  });
  res.json(vendas);
});

// === 6. START DO SERVIDOR ===
// O "sync({ force: true })" recria o banco toda vez que reinicia. 
// Para persistir dados, mude para "sync()" apenas.
const PORT = 3000;
app.listen(PORT, async () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
  try {
    // force: false garante que não apagamos os dados ao reiniciar
    await sequelize.sync({ force: false }); 
    console.log('💾 Banco de dados sincronizado!');
  } catch (error) {
    console.error('Erro no banco:', error);
  }
});
