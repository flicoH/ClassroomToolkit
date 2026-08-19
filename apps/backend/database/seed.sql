USE classroom_toolkit;

SET @seed_teacher_id = (SELECT id FROM teacher_auth_teachers ORDER BY created_at ASC LIMIT 1);

-- ==============================================================================================
-- 学生管理模块 seed
-- ==============================================================================================

INSERT INTO student_classrooms (teacher_id, id, name) VALUES
  (@seed_teacher_id, 'grade-1', '一年级'),
  (@seed_teacher_id, 'grade-2', '二年级')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO student_groups (teacher_id, id, classroom_id, name) VALUES
  (@seed_teacher_id, 'group-grade-1-1', 'grade-1', '第一组'),
  (@seed_teacher_id, 'group-grade-1-2', 'grade-1', '第二组'),
  (@seed_teacher_id, 'group-grade-2-a', 'grade-2', 'A 组')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO student_students (teacher_id, id, classroom_id, name, student_no, gender, group_name) VALUES
  (@seed_teacher_id, '2026001', 'grade-1', '周杰伦', '2026001', '男', '第一组'),
  (@seed_teacher_id, '2026002', 'grade-1', '周杰伦', '2026002', '男', '第一组'),
  (@seed_teacher_id, '2026003', 'grade-1', '周杰伦', '2026003', '男', '第二组'),
  (@seed_teacher_id, '2026101', 'grade-2', '孙燕姿', '2026101', '女', 'A 组'),
  (@seed_teacher_id, '2026102', 'grade-2', '林俊杰', '2026102', '男', 'A 组')
ON DUPLICATE KEY UPDATE name = VALUES(name), gender = VALUES(gender), group_name = VALUES(group_name);

-- ==============================================================================================
-- 任务统计模块 seed
-- ==============================================================================================

INSERT INTO task_stats_tasks (teacher_id, id, title, class_name, task_type, status_count, created_at) VALUES
  (@seed_teacher_id, 'homework-check', '课后作业完成情况统计', '一年级', 'status', 3, '2026-06-04')
ON DUPLICATE KEY UPDATE title = VALUES(title);

INSERT INTO task_stats_students (teacher_id, id, task_id, student_id, name, student_no, status) VALUES
  (@seed_teacher_id, 'homework-check-2026001', 'homework-check', '2026001', '周杰伦', '2026001', '未完成'),
  (@seed_teacher_id, 'homework-check-2026002', 'homework-check', '2026002', '周杰伦', '2026002', '未完成'),
  (@seed_teacher_id, 'homework-check-2026003', 'homework-check', '2026003', '周杰伦', '2026003', '未完成')
ON DUPLICATE KEY UPDATE status = VALUES(status);

-- ==============================================================================================
-- 座位表模块 seed
-- ==============================================================================================

INSERT INTO seating_chart_charts (teacher_id, id, class_name, rows_count, cols_count) VALUES
  (@seed_teacher_id, 'default', '一年级', 4, 4)
ON DUPLICATE KEY UPDATE class_name = VALUES(class_name), rows_count = VALUES(rows_count), cols_count = VALUES(cols_count);

INSERT INTO seating_chart_students (teacher_id, id, chart_id, name, student_no) VALUES
  (@seed_teacher_id, '2026001', 'default', '周杰伦', '2026001'),
  (@seed_teacher_id, '2026002', 'default', '周杰伦', '2026002'),
  (@seed_teacher_id, '2026003', 'default', '周杰伦', '2026003'),
  (@seed_teacher_id, '2026004', 'default', '林俊杰', '2026004'),
  (@seed_teacher_id, '2026005', 'default', '孙燕姿', '2026005'),
  (@seed_teacher_id, '2026006', 'default', '王心凌', '2026006'),
  (@seed_teacher_id, '2026007', 'default', '李宇春', '2026007'),
  (@seed_teacher_id, '2026008', 'default', '周笔畅', '2026008')
ON DUPLICATE KEY UPDATE name = VALUES(name), student_no = VALUES(student_no);

INSERT INTO seating_chart_seats (teacher_id, id, chart_id, row_index, col_index, student_id) VALUES
  (@seed_teacher_id, 'seat-0-0', 'default', 0, 0, '2026001'),
  (@seed_teacher_id, 'seat-0-1', 'default', 0, 1, '2026002'),
  (@seed_teacher_id, 'seat-0-2', 'default', 0, 2, '2026003'),
  (@seed_teacher_id, 'seat-0-3', 'default', 0, 3, '2026004'),
  (@seed_teacher_id, 'seat-1-0', 'default', 1, 0, '2026005'),
  (@seed_teacher_id, 'seat-1-1', 'default', 1, 1, '2026006'),
  (@seed_teacher_id, 'seat-1-2', 'default', 1, 2, '2026007'),
  (@seed_teacher_id, 'seat-1-3', 'default', 1, 3, '2026008'),
  (@seed_teacher_id, 'seat-2-0', 'default', 2, 0, NULL),
  (@seed_teacher_id, 'seat-2-1', 'default', 2, 1, NULL),
  (@seed_teacher_id, 'seat-2-2', 'default', 2, 2, NULL),
  (@seed_teacher_id, 'seat-2-3', 'default', 2, 3, NULL),
  (@seed_teacher_id, 'seat-3-0', 'default', 3, 0, NULL),
  (@seed_teacher_id, 'seat-3-1', 'default', 3, 1, NULL),
  (@seed_teacher_id, 'seat-3-2', 'default', 3, 2, NULL),
  (@seed_teacher_id, 'seat-3-3', 'default', 3, 3, NULL)
ON DUPLICATE KEY UPDATE student_id = VALUES(student_id);

-- ==============================================================================================
-- 随机点名模块 seed
-- ==============================================================================================

INSERT INTO random_picker_classes (teacher_id, id, name) VALUES
  (@seed_teacher_id, 'grade-1', '一年级'),
  (@seed_teacher_id, 'grade-2', '二年级')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO random_picker_students (teacher_id, id, class_id, name, student_no) VALUES
  (@seed_teacher_id, 'rp-2026001', 'grade-1', '周杰伦', '2026001'),
  (@seed_teacher_id, 'rp-2026002', 'grade-1', '周杰伦', '2026002'),
  (@seed_teacher_id, 'rp-2026003', 'grade-1', '周杰伦', '2026003'),
  (@seed_teacher_id, 'rp-2026004', 'grade-1', '林俊杰', '2026004'),
  (@seed_teacher_id, 'rp-2026005', 'grade-1', '孙燕姿', '2026005'),
  (@seed_teacher_id, 'rp-2026006', 'grade-1', '王心凌', '2026006'),
  (@seed_teacher_id, 'rp-2026101', 'grade-2', '李宇春', '2026101'),
  (@seed_teacher_id, 'rp-2026102', 'grade-2', '周笔畅', '2026102'),
  (@seed_teacher_id, 'rp-2026103', 'grade-2', '张靓颖', '2026103'),
  (@seed_teacher_id, 'rp-2026104', 'grade-2', '陈楚生', '2026104')
ON DUPLICATE KEY UPDATE name = VALUES(name), student_no = VALUES(student_no);

-- ==============================================================================================
-- 倒计时模块 seed
-- ==============================================================================================

INSERT INTO countdown_states (teacher_id, id, total_seconds, remaining_seconds, is_running) VALUES
  (@seed_teacher_id, @seed_teacher_id, 300, 300, FALSE)
ON DUPLICATE KEY UPDATE total_seconds = VALUES(total_seconds), remaining_seconds = VALUES(remaining_seconds);

-- ==============================================================================================
-- 便签模块 seed
-- ==============================================================================================

INSERT INTO sticky_notes_notes (teacher_id, id, title, content, color, pinned, updated_at) VALUES
  (@seed_teacher_id, 'note-1', '课前提醒', '检查投屏、计时器和随机点名名单，提前打开课堂小工具。', 'yellow', TRUE, '09:10'),
  (@seed_teacher_id, 'note-2', '作业反馈', '第三组需要补交阅读记录，课后提醒组长统一收齐。', 'blue', FALSE, '10:25'),
  (@seed_teacher_id, 'note-3', '课堂观察', '今天回答积极的同学：周杰伦、林俊杰、孙燕姿。', 'green', FALSE, '11:05')
ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content), color = VALUES(color), pinned = VALUES(pinned);

-- ==============================================================================================
-- 宠物积分模块 seed
-- ==============================================================================================

INSERT INTO pet_points_students
  (teacher_id, id, name, student_no, class_id, class_name, group_name, score, max_score, trophies, level_num, stage, pet_progress, pet_hatched, absent, completed_pets)
VALUES
  (@seed_teacher_id, '2026002', '周杰伦', '2026002', 'grade-1', '一年级', '一组', 10, 30, 1, 1, '初始形态', 0, FALSE, FALSE, 0),
  (@seed_teacher_id, '2026001', '林俊杰', '2026001', 'grade-1', '一年级', '二组', 6, 30, 0, 1, '初始形态', 0, FALSE, FALSE, 0),
  (@seed_teacher_id, '2026003', '陈奕迅', '2026003', 'grade-1', '一年级', '三组', 6, 30, 0, 1, '初始形态', 0, FALSE, FALSE, 0)
ON DUPLICATE KEY UPDATE score = VALUES(score), trophies = VALUES(trophies);

INSERT INTO pet_points_rubrics (teacher_id, id, category, label, score, enabled) VALUES
  (@seed_teacher_id, 'class-speaking', '课堂表现', '积极发言', 2, TRUE),
  (@seed_teacher_id, 'class-listening', '课堂表现', '认真听讲', 1, TRUE),
  (@seed_teacher_id, 'homework-on-time', '作业情况', '按时交作业', 3, TRUE),
  (@seed_teacher_id, 'homework-excellent', '作业情况', '作业优秀', 2, TRUE),
  (@seed_teacher_id, 'character-helpful', '品德修养', '乐于助人', 5, TRUE),
  (@seed_teacher_id, 'discipline-disrupt', '纪律常规', '扰乱课堂', -2, TRUE),
  (@seed_teacher_id, 'discipline-late', '纪律常规', '迟到早退', -1, TRUE)
ON DUPLICATE KEY UPDATE label = VALUES(label), score = VALUES(score), enabled = VALUES(enabled);

INSERT INTO pet_points_rewards (teacher_id, id, name, cost, stock, enabled) VALUES
  (@seed_teacher_id, 'reward-sticker', '星星贴纸', 5, 12, TRUE),
  (@seed_teacher_id, 'reward-homework-pass', '作业免写卡', 12, 6, TRUE),
  (@seed_teacher_id, 'reward-seat-choice', '座位优先选择', 18, 4, TRUE),
  (@seed_teacher_id, 'reward-mystery-box', '惊喜盲盒', 25, 3, TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name), cost = VALUES(cost), stock = VALUES(stock), enabled = VALUES(enabled);

-- ==============================================================================================
-- 扭蛋机模块：gacha-machine
-- ==============================================================================================

INSERT INTO gacha_machine_rewards (teacher_id, id, name, description, rarity, weight, stock, enabled) VALUES
  (@seed_teacher_id, 'gacha-sticker', '星星贴纸', '抽中即可获得一张星星贴纸。', '普通', 40, 30, TRUE),
  (@seed_teacher_id, 'gacha-pencil', '幸运铅笔', '领取一支课堂幸运铅笔。', '普通', 30, 20, TRUE),
  (@seed_teacher_id, 'gacha-homework-pass', '作业免写卡', '一次指定练习免写机会。', '稀有', 15, 8, TRUE),
  (@seed_teacher_id, 'gacha-seat-choice', '座位优先选择', '下一次换座位优先选择。', '史诗', 8, 4, TRUE),
  (@seed_teacher_id, 'gacha-mystery', '神秘大奖', '老师准备的课堂惊喜奖励。', '传说', 2, 1, TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  rarity = VALUES(rarity),
  weight = VALUES(weight),
  stock = VALUES(stock),
  enabled = VALUES(enabled);
