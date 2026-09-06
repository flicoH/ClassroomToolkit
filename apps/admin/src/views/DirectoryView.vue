<script setup lang="ts">
/** 师生班级共用只读列表，通过路由参数保留从教师详情跳转过来的归属筛选。 */
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, formatTime, type Page, type Person } from '../lib/api'
import PaginationBar from '../components/PaginationBar.vue'
const route = useRoute(),
  kind = route.path.slice(1),
  data = ref<Page<Person>>(),
  error = ref(''),
  loading = ref(false),
  page = ref(1)
const search = ref(''),
  teacherSearch = ref(''),
  classroomSearch = ref('')
/** 递增请求序号，只接纳最新筛选请求的结果，避免较慢旧响应覆盖新页面数据。 */
let requestId = 0
async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await api<Page<Person>>(kind, {
      page: page.value,
      search: search.value,
      teacherSearch: teacherSearch.value,
      classroomSearch: classroomSearch.value,
      teacherId: typeof route.query.teacherId === 'string' ? route.query.teacherId : undefined,
      classroomId:
        typeof route.query.classroomId === 'string' ? route.query.classroomId : undefined,
    })
    if (id === requestId) data.value = result
  } catch (e) {
    if (id === requestId) {
      error.value = (e as Error).message
      data.value = undefined
    }
  } finally {
    if (id === requestId) loading.value = false
  }
}
watch(
  () => route.query,
  () => {
    page.value = 1
    void load()
  },
)
onMounted(load)

function changePage(value: number) {
  page.value = value
  void load()
}
function searchRecords() {
  page.value = 1
  void load()
}
</script>
<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">DIRECTORY</p>
      <h1>{{ route.meta.title }}</h1>
      <p class="muted">
        {{
          kind === 'teachers'
            ? '查询教师账号、班级规模与最近登录。'
            : kind === 'students'
              ? '按教师与班级查询学生档案，数量不代表跨教师去重人数。'
              : '查看班级归属及学生数量。'
        }}
      </p>
    </div>
  </div>
  <form class="toolbar" @submit.prevent="searchRecords">
    <input
      v-model="search"
      type="search"
      :placeholder="
        kind === 'teachers'
          ? '搜索教师姓名或账号'
          : kind === 'students'
            ? '搜索学生姓名或学号'
            : '搜索班级名称'
      "
      aria-label="搜索"
      maxlength="100"
    /><input
      v-if="kind !== 'teachers'"
      v-model="teacherSearch"
      placeholder="所属教师姓名或账号"
      aria-label="所属教师"
      maxlength="100"
    /><input
      v-if="kind === 'students'"
      v-model="classroomSearch"
      placeholder="班级名称"
      aria-label="所属班级"
      maxlength="100"
    /><button class="primary" :disabled="loading">查询</button
    ><RouterLink
      v-if="route.query.teacherId || route.query.classroomId"
      class="link"
      :to="route.path"
      >清除归属筛选</RouterLink
    >
  </form>
  <p v-if="error" class="error" role="alert">{{ error }} <button @click="load">重试</button></p>
  <p v-if="loading" role="status" class="muted">正在加载…</p>
  <section class="panel">
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{{ kind === 'teachers' ? '教师' : kind === 'students' ? '学生' : '班级' }}</th>
            <template v-if="kind === 'teachers'"
              ><th>注册时间</th>
              <th>最近登录</th>
              <th>班级数</th>
              <th>学生数</th>
              <th>详情</th></template
            ><template v-else
              ><th>所属教师</th>
              <template v-if="kind === 'students'"
                ><th>学号</th>
                <th>性别</th>
                <th>所属班级</th></template
              ><template v-else
                ><th>学生数</th>
                <th>查看</th></template
              ></template
            >
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data?.items" :key="row.id">
            <td>
              <strong>{{ row.name }}</strong
              ><small v-if="kind === 'teachers'">{{ row.username }}</small>
            </td>
            <template v-if="kind === 'teachers'"
              ><td>{{ formatTime(row.createdAt) }}</td>
              <td>{{ formatTime(row.lastLoginAt) }}</td>
              <td>
                <RouterLink :to="{ path: '/classrooms', query: { teacherId: row.id } }">{{
                  row.classrooms
                }}</RouterLink>
              </td>
              <td>
                <RouterLink :to="{ path: '/students', query: { teacherId: row.id } }">{{
                  row.students
                }}</RouterLink>
              </td>
              <td><RouterLink :to="`/teachers/${row.id}`">查看详情 →</RouterLink></td></template
            ><template v-else
              ><td>
                <RouterLink :to="`/teachers/${row.teacherId}`">{{
                  row.teacherName || '已删除教师'
                }}</RouterLink>
              </td>
              <template v-if="kind === 'students'"
                ><td>{{ row.studentNo }}</td>
                <td>{{ row.gender || '未填写' }}</td>
                <td>{{ row.classroomName || '—' }}</td></template
              ><template v-else
                ><td>{{ row.students }}</td>
                <td>
                  <RouterLink
                    :to="{
                      path: '/students',
                      query: { classroomId: row.id, teacherId: row.teacherId },
                    }"
                    >查看学生 →</RouterLink
                  >
                </td></template
              ></template
            >
          </tr>
        </tbody>
      </table>
      <p v-if="!data?.items.length && !loading" class="empty">暂无符合条件的记录</p>
    </div>
    <PaginationBar
      v-if="data"
      :page="page"
      :total="data.total"
      :loading="loading"
      @change="changePage"
    />
  </section>
</template>
