import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';

// Importar configuração do banco de dados
import { initializeDatabase } from './config/database.js';

// Importar middlewares
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';

// Importar rotas
import authRoutes from './routes/auth.js';
import devicesRoutes from './routes/devices.js';
import contentRoutes from './routes/content.js';
import systemRoutes from './routes/system.js';

// Importar WebSocket
import { initializeWebSocket } from './websocket/index.js';

// Configurar variáveis de ambiente
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5174",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Middlewares de segurança
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5174",
  credentials: true
}));

// Rate limiting
app.use(rateLimiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir arquivos estáticos (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/system', systemRoutes);

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({ 
    message: 'TVBOX Control System API',
    version: '1.0.0',
    status: 'running'
  });
});

// Middleware de tratamento de erros (deve ser o último)
app.use(errorHandler);

// Inicializar WebSocket
initializeWebSocket(io);

// Função para inicializar o servidor
async function startServer() {
  try {
    console.log('🚀 Iniciando servidor TVBOX...');
    
    // Inicializar banco de dados
    console.log('📊 Conectando ao banco de dados MySQL...');
    await initializeDatabase();
    
    // Iniciar servidor
    server.listen(PORT, () => {
      console.log(`✅ Servidor rodando na porta ${PORT}`);
      console.log(`🌐 API disponível em: http://localhost:${PORT}`);
      console.log(`📁 Uploads em: http://localhost:${PORT}/uploads`);
      console.log(`🔌 WebSocket ativo para comunicação em tempo real`);
      console.log(`🛡️  Segurança: Helmet e CORS configurados`);
      console.log(`⚡ Rate limiting ativo`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 Modo de desenvolvimento ativo');
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao inicializar servidor:', error);
    process.exit(1);
  }
}

// Tratamento de sinais do sistema
process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, encerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor encerrado graciosamente');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Recebido SIGINT, encerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor encerrado graciosamente');
    process.exit(0);
  });
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
  process.exit(1);
});

// Inicializar servidor
startServer();

export default app;