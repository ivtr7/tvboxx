import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Configuração do banco de dados MySQL
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tvbox_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Criar pool de conexões
const pool = mysql.createPool(dbConfig);

// Função para inicializar o banco de dados
export async function initializeDatabase() {
  try {
    // Criar banco de dados se não existir
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port
    });
    
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
    await connection.end();
    
    // Criar tabelas
    await createTables();
    
    console.log('✅ Banco de dados MySQL inicializado com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco de dados:', error);
    throw error;
  }
}

// Função para criar tabelas
async function createTables() {
  const tables = [
    // Tabela de usuários
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'user') DEFAULT 'user',
      tenant_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    
    // Tabela de dispositivos
    `CREATE TABLE IF NOT EXISTS devices (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      location VARCHAR(255),
      status ENUM('online', 'offline', 'maintenance') DEFAULT 'offline',
      last_seen TIMESTAMP NULL,
      tenant_id VARCHAR(255),
      ip_address VARCHAR(45),
      mac_address VARCHAR(17),
      device_info JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    
    // Tabela de conteúdo
    `CREATE TABLE IF NOT EXISTS content (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      type ENUM('video', 'image', 'audio', 'text') NOT NULL,
      file_path VARCHAR(500),
      file_size BIGINT,
      duration INT,
      active BOOLEAN DEFAULT true,
      tenant_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    
    // Tabela de playlists
    `CREATE TABLE IF NOT EXISTS playlists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      content_ids JSON,
      active BOOLEAN DEFAULT true,
      tenant_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    

    
    // Tabela de logs
    `CREATE TABLE IF NOT EXISTS device_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      device_id VARCHAR(255),
      event_type VARCHAR(100),
      message TEXT,
      data JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_device_id (device_id)
    )`
  ];
  
  for (const table of tables) {
    await pool.execute(table);
  }
}

// Exportar pool de conexões
export const db = pool;

// Função para testar conexão
export async function testConnection() {
  try {
    const [rows] = await pool.execute('SELECT 1 as test');
    return { success: true, message: 'Conexão com MySQL estabelecida' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

export default pool;