CREATE DATABASE IF NOT EXISTS ai_data_workbench CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ai_data_workbench;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  role ENUM('owner','viewer') NOT NULL DEFAULT 'owner',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS projects (
  id CHAR(36) PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (owner_id)
);
CREATE TABLE IF NOT EXISTS datasets (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  row_count INT NOT NULL,
  column_count INT NOT NULL,
  current_version INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (project_id)
);
CREATE TABLE IF NOT EXISTS dataset_fields (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dataset_id CHAR(36) NOT NULL,
  field_name VARCHAR(190) NOT NULL,
  field_alias VARCHAR(190),
  inferred_type VARCHAR(20) NOT NULL,
  missing_rate DECIMAL(6,2),
  unique_count INT,
  INDEX (dataset_id)
);
CREATE TABLE IF NOT EXISTS dataset_versions (
  id CHAR(36) PRIMARY KEY,
  dataset_id CHAR(36) NOT NULL,
  version_number INT NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  row_count INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dataset_version (dataset_id, version_number)
);
CREATE TABLE IF NOT EXISTS cleaning_rules (
  id CHAR(36) PRIMARY KEY,
  dataset_version_id CHAR(36) NOT NULL,
  sequence_number INT NOT NULL,
  operation VARCHAR(40) NOT NULL,
  field_name VARCHAR(190),
  params_json JSON,
  INDEX (dataset_version_id)
);
CREATE TABLE IF NOT EXISTS analysis_tasks (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  dataset_id CHAR(36) NOT NULL,
  task_type VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  progress TINYINT NOT NULL DEFAULT 0,
  params_json JSON,
  result_json JSON,
  error_message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (project_id, created_at)
);
CREATE TABLE IF NOT EXISTS chart_configs (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  dataset_id CHAR(36) NOT NULL,
  title VARCHAR(100) NOT NULL,
  config_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (project_id)
);
CREATE TABLE IF NOT EXISTS ai_sessions (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  dataset_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (project_id)
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  role VARCHAR(15) NOT NULL,
  content TEXT NOT NULL,
  result_json JSON,
  duration_ms INT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (session_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  title VARCHAR(100) NOT NULL,
  sections_json JSON NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (project_id)
);
CREATE TABLE IF NOT EXISTS operation_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36),
  action VARCHAR(80) NOT NULL,
  object_id CHAR(36),
  trace_id CHAR(36),
  ip_address VARCHAR(45),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (created_at)
);

 
 
CREATE TABLE IF NOT EXISTS app_state (id INT PRIMARY KEY, data JSON NOT NULL);
