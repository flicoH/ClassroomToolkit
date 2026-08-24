-- ClassroomToolkit database schema
-- MySQL 8.x compatible.

CREATE DATABASE IF NOT EXISTS classroom_toolkit
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE classroom_toolkit;

-- ==============================================================================================
-- 教师登录注册模块：teacher-auth
-- ==============================================================================================

CREATE TABLE IF NOT EXISTS teacher_auth_teachers (
  id VARCHAR(64) PRIMARY KEY COMMENT '教师ID',
  username VARCHAR(64) NOT NULL UNIQUE COMMENT '登录用户名',
  name VARCHAR(64) NOT NULL COMMENT '教师显示名称',
  email VARCHAR(128) NOT NULL COMMENT '邮箱',
  avatar VARCHAR(512) NOT NULL DEFAULT '' COMMENT '头像地址',
  password_hash VARCHAR(256) NOT NULL COMMENT '加盐后的密码哈希',
  password_salt VARCHAR(64) NOT NULL COMMENT '密码盐',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB COMMENT='教师账号表';

CREATE TABLE IF NOT EXISTS teacher_auth_sessions (
  id VARCHAR(64) PRIMARY KEY COMMENT '会话ID',
  teacher_id VARCHAR(64) NOT NULL COMMENT '教师ID',
  token_hash VARCHAR(128) NOT NULL UNIQUE COMMENT '登录令牌摘要',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间',
  expires_at DATETIME NOT NULL COMMENT '过期时间',
  CONSTRAINT fk_teacher_auth_sessions_teacher
    FOREIGN KEY (teacher_id) REFERENCES teacher_auth_teachers(id)
    ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='教师登录会话表';

-- ==============================================================================================
-- 学生管理模块：students
-- ==============================================================================================

CREATE TABLE IF NOT EXISTS student_classrooms (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '班级ID',
  name VARCHAR(64) NOT NULL COMMENT '班级名称',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB COMMENT='班级表';

CREATE TABLE IF NOT EXISTS student_groups (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '分组ID',
  classroom_id VARCHAR(64) NOT NULL COMMENT '班级ID',
  name VARCHAR(64) NOT NULL COMMENT '分组名称',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_student_groups_classroom_name (classroom_id, name),
  CONSTRAINT fk_student_groups_classroom
    FOREIGN KEY (classroom_id) REFERENCES student_classrooms(id)
    ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='班级分组表';

CREATE TABLE IF NOT EXISTS student_students (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '学生ID',
  classroom_id VARCHAR(64) NOT NULL COMMENT '班级ID',
  name VARCHAR(64) NOT NULL COMMENT '学生姓名',
  student_no VARCHAR(64) NOT NULL COMMENT '学号',
  gender ENUM('男', '女', '') NOT NULL DEFAULT '' COMMENT '性别',
  group_name VARCHAR(64) NULL COMMENT '分组名称',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_student_students_classroom_no (classroom_id, student_no),
  KEY idx_student_students_classroom (classroom_id),
  CONSTRAINT fk_student_students_classroom
    FOREIGN KEY (classroom_id) REFERENCES student_classrooms(id)
    ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='学生表';

-- ==============================================================================================
-- 任务统计模块：task-stats
-- ==============================================================================================

CREATE TABLE IF NOT EXISTS task_stats_tasks (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '任务ID',
  title VARCHAR(128) NOT NULL COMMENT '任务名称',
  class_name VARCHAR(64) NOT NULL COMMENT '班级名称快照',
  task_type ENUM('status', 'score') NOT NULL COMMENT '任务类型',
  status_count INT NOT NULL DEFAULT 3 COMMENT '状态数量',
  created_at DATE NOT NULL COMMENT '创建日期',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB COMMENT='任务统计任务表';

CREATE TABLE IF NOT EXISTS task_stats_students (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '任务学生记录ID',
  task_id VARCHAR(64) NOT NULL COMMENT '任务ID',
  student_id VARCHAR(64) NOT NULL COMMENT '学生ID快照',
  name VARCHAR(64) NOT NULL COMMENT '学生姓名快照',
  student_no VARCHAR(64) NOT NULL COMMENT '学号快照',
  status ENUM('未完成', '已完成', '需订正') NOT NULL DEFAULT '未完成' COMMENT '完成状态',
  score DECIMAL(6,2) NULL COMMENT '分数型任务得分',
  CONSTRAINT fk_task_stats_students_task
    FOREIGN KEY (task_id) REFERENCES task_stats_tasks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='任务统计学生状态表';

-- ==============================================================================================
-- 座位表模块：seating-chart
-- ==============================================================================================

CREATE TABLE IF NOT EXISTS seating_chart_charts (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '座位表ID',
  class_name VARCHAR(64) NOT NULL COMMENT '班级名称',
  class_id VARCHAR(64) NULL COMMENT '关联班级ID',
  rows_count INT NOT NULL COMMENT '行数',
  cols_count INT NOT NULL COMMENT '列数',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB COMMENT='座位表主表';

CREATE TABLE IF NOT EXISTS seating_chart_students (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '座位表学生ID',
  chart_id VARCHAR(64) NOT NULL COMMENT '座位表ID',
  source_student_id VARCHAR(64) NULL COMMENT '学生管理模块中的学生ID',
  name VARCHAR(64) NOT NULL COMMENT '学生姓名',
  student_no VARCHAR(64) NOT NULL COMMENT '学号',
  CONSTRAINT fk_seating_chart_students_chart
    FOREIGN KEY (chart_id) REFERENCES seating_chart_charts(id)
    ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='座位表学生快照表';

CREATE TABLE IF NOT EXISTS seating_chart_seats (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '座位ID',
  chart_id VARCHAR(64) NOT NULL COMMENT '座位表ID',
  row_index INT NOT NULL COMMENT '行索引，从0开始',
  col_index INT NOT NULL COMMENT '列索引，从0开始',
  student_id VARCHAR(64) NULL COMMENT '已安排学生ID',
  UNIQUE KEY uk_seating_chart_seat_position (chart_id, row_index, col_index),
  CONSTRAINT fk_seating_chart_seats_chart
    FOREIGN KEY (chart_id) REFERENCES seating_chart_charts(id)
    ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='座位格表';

-- ==============================================================================================
-- 随机点名模块：random-picker
-- ==============================================================================================

CREATE TABLE IF NOT EXISTS random_picker_classes (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '点名班级ID',
  name VARCHAR(64) NOT NULL COMMENT '班级名称'
) ENGINE=InnoDB COMMENT='随机点名班级表';

CREATE TABLE IF NOT EXISTS random_picker_students (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '点名学生ID',
  class_id VARCHAR(64) NOT NULL COMMENT '点名班级ID',
  name VARCHAR(64) NOT NULL COMMENT '学生姓名',
  student_no VARCHAR(64) NOT NULL COMMENT '学号',
  CONSTRAINT fk_random_picker_students_class
    FOREIGN KEY (class_id) REFERENCES random_picker_classes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='随机点名学生表';

CREATE TABLE IF NOT EXISTS random_picker_histories (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '点名历史ID',
  class_id VARCHAR(64) NOT NULL COMMENT '班级ID',
  selected_count INT NOT NULL COMMENT '抽取人数',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '抽取时间',
  CONSTRAINT fk_random_picker_histories_class
    FOREIGN KEY (class_id) REFERENCES random_picker_classes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='随机点名历史表';

CREATE TABLE IF NOT EXISTS random_picker_history_students (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '自增ID',
  history_id VARCHAR(64) NOT NULL COMMENT '点名历史ID',
  student_id VARCHAR(64) NOT NULL COMMENT '学生ID',
  name VARCHAR(64) NOT NULL COMMENT '学生姓名快照',
  student_no VARCHAR(64) NOT NULL COMMENT '学号快照',
  CONSTRAINT fk_random_picker_history_students_history
    FOREIGN KEY (history_id) REFERENCES random_picker_histories(id)
    ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='随机点名历史学生表';

-- ==============================================================================================
-- 倒计时模块：countdown
-- ==============================================================================================

CREATE TABLE IF NOT EXISTS countdown_states (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '倒计时状态ID',
  total_seconds INT NOT NULL COMMENT '总秒数',
  remaining_seconds INT NOT NULL COMMENT '剩余秒数',
  is_running BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否运行中',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB COMMENT='倒计时状态表';

-- ==============================================================================================
-- 便签模块：sticky-notes
-- ==============================================================================================

CREATE TABLE IF NOT EXISTS sticky_notes_notes (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '便签ID',
  title VARCHAR(128) NOT NULL COMMENT '标题',
  content TEXT NOT NULL COMMENT '内容',
  color ENUM('yellow', 'blue', 'green', 'pink', 'purple') NOT NULL COMMENT '颜色',
  pinned BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否置顶',
  updated_at VARCHAR(16) NOT NULL COMMENT '前端展示用更新时间，例如 09:10',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE=InnoDB COMMENT='便签表';

-- ==============================================================================================
-- 宠物积分模块：pet-points
-- ==============================================================================================

CREATE TABLE IF NOT EXISTS pet_points_students (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '积分学生ID',
  name VARCHAR(64) NOT NULL COMMENT '学生姓名',
  student_no VARCHAR(64) NOT NULL COMMENT '学号',
  class_id VARCHAR(64) NOT NULL DEFAULT 'grade-1' COMMENT '班级ID',
  class_name VARCHAR(64) NOT NULL DEFAULT '一年级' COMMENT '班级名称',
  group_name VARCHAR(64) NOT NULL COMMENT '分组',
  score INT NOT NULL DEFAULT 0 COMMENT '当前积分',
  max_score INT NOT NULL DEFAULT 30 COMMENT '最高成长积分',
  trophies INT NOT NULL DEFAULT 0 COMMENT '奖杯数',
  level_num INT NOT NULL DEFAULT 1 COMMENT '等级',
  stage ENUM('初始形态', '成长形态', '进阶形态', '终极形态') NOT NULL DEFAULT '初始形态' COMMENT '成长阶段',
  pet_id VARCHAR(64) NULL COMMENT '绑定宠物ID',
  pet_name VARCHAR(64) NULL COMMENT '宠物昵称',
  pet_progress INT NOT NULL DEFAULT 0 COMMENT '宠物成长值',
  pet_hatched BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否孵化',
  absent BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否缺勤',
  completed_pets INT NOT NULL DEFAULT 0 COMMENT '已完成宠物数量'
) ENGINE=InnoDB COMMENT='宠物积分学生表';

CREATE TABLE IF NOT EXISTS pet_points_rubrics (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '评价指标ID',
  category ENUM('课堂表现', '作业情况', '品德修养', '纪律常规') NOT NULL COMMENT '评价分类',
  label VARCHAR(64) NOT NULL COMMENT '指标名称',
  score INT NOT NULL COMMENT '分值',
  enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用'
) ENGINE=InnoDB COMMENT='宠物积分评价指标表';

CREATE TABLE IF NOT EXISTS pet_points_rewards (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '奖品ID',
  name VARCHAR(64) NOT NULL COMMENT '奖品名称',
  cost INT NOT NULL COMMENT '兑换积分',
  stock INT NOT NULL COMMENT '库存',
  enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用'
) ENGINE=InnoDB COMMENT='宠物积分奖品表';

CREATE TABLE IF NOT EXISTS pet_points_evaluation_records (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '评价记录ID',
  student_id VARCHAR(64) NOT NULL COMMENT '学生ID',
  category VARCHAR(32) NOT NULL COMMENT '评价分类',
  label VARCHAR(64) NOT NULL COMMENT '评价名称',
  delta_score INT NOT NULL COMMENT '积分变化',
  pet_delta INT NULL COMMENT '宠物成长变化',
  note VARCHAR(255) NOT NULL DEFAULT '' COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  CONSTRAINT fk_pet_points_records_student
    FOREIGN KEY (student_id) REFERENCES pet_points_students(id)
    ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='宠物积分评价记录表';

CREATE TABLE IF NOT EXISTS pet_points_redemptions (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '兑换记录ID',
  student_id VARCHAR(64) NOT NULL COMMENT '学生ID',
  reward_name VARCHAR(64) NOT NULL COMMENT '奖品名称快照',
  cost INT NOT NULL COMMENT '消耗积分',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '兑换时间',
  CONSTRAINT fk_pet_points_redemptions_student
    FOREIGN KEY (student_id) REFERENCES pet_points_students(id)
    ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='宠物积分兑换记录表';

-- ==============================================================================================
-- 扭蛋机模块：gacha-machine
-- ==============================================================================================

CREATE TABLE IF NOT EXISTS gacha_machine_rewards (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '扭蛋奖励ID',
  name VARCHAR(80) NOT NULL COMMENT '奖励名称',
  description TEXT NOT NULL COMMENT '奖励说明',
  rarity ENUM('普通', '稀有', '史诗', '传说') NOT NULL DEFAULT '普通' COMMENT '稀有度',
  weight INT NOT NULL DEFAULT 10 COMMENT '抽取权重',
  stock INT NOT NULL DEFAULT 0 COMMENT '库存',
  enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB COMMENT='扭蛋机奖励表';

CREATE TABLE IF NOT EXISTS gacha_machine_draw_records (
  teacher_id VARCHAR(64) NOT NULL COMMENT '数据所属教师ID',
  id VARCHAR(64) PRIMARY KEY COMMENT '扭蛋记录ID',
  reward_id VARCHAR(64) NOT NULL COMMENT '奖励ID快照',
  reward_name VARCHAR(80) NOT NULL COMMENT '奖励名称快照',
  rarity ENUM('普通', '稀有', '史诗', '传说') NOT NULL DEFAULT '普通' COMMENT '稀有度快照',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '抽取时间'
) ENGINE=InnoDB COMMENT='扭蛋机抽取记录表';
