export const attendanceLabels = {
  present: "出勤",
  excused: "请假",
  late: "迟到"
} as const;

export type CourseAttendanceStatus = keyof typeof attendanceLabels;

/**
 * 课程出勤选择器。
 * 默认 label 为“课程出勤情况”，在多课次场景下支持传入“第 N 节课出勤情况”等自定义标题。
 */
export function CourseAttendance({
  value = "present",
  onChange,
  label = "课程出勤情况"
}: {
  value?: CourseAttendanceStatus;
  onChange: (value: CourseAttendanceStatus) => void;
  label?: string;
}) {
  return (
    <label className="block space-y-1 text-xs font-semibold">
      <span>{label}</span>
      <select
        className="block h-9 w-full rounded-lg border border-input bg-background px-2 text-xs"
        value={value}
        onChange={event => onChange(event.target.value as CourseAttendanceStatus)}
      >
        {Object.entries(attendanceLabels).map(([status, label]) => (
          <option key={status} value={status}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
