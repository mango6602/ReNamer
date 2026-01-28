<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { 
  FolderOpenIcon, 
  PlusIcon, 
  TrashIcon, 
  PlayIcon, 
  DocumentIcon,
  FolderIcon,
  ArrowPathIcon,
  XMarkIcon,
  Bars3Icon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowDownTrayIcon,
  Bars2Icon
} from '@heroicons/vue/24/outline';

// --- State ---
const dirHandle = ref(null);
const files = ref([]); // Array of { id, handle, originalName, newName, status, error, selected }
const steps = ref([]); // Array of { id, type, params, active }
const isProcessing = ref(false);
const filterText = ref('');
const isMenuOpen = ref(false);
const isDragging = ref(false);
const dragCounter = ref(0);
const targetMode = ref('file'); // 'file' or 'folder'
const draggedStepIndex = ref(null); // For step sorting
const lastSwapTime = ref(0); // For throttling swaps

// --- Constants ---
const STEP_TYPES = [
  { label: '查找替换', value: 'replace' },
  { label: '添加文本', value: 'add' },
  { label: '插入文本', value: 'insert' },
  { label: '删除文本', value: 'delete' },
  { label: '序列号', value: 'numbering' },
  { label: '格式化', value: 'format' },
  { label: '去除空格', value: 'trim' },
  { label: '修改扩展名', value: 'extension' },
];

// --- Actions ---

// Close menu on click outside
const closeMenu = (e) => {
  if (!e.target.closest('.add-step-btn')) {
    isMenuOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', closeMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', closeMenu);
});

// 1. Open Directory
const openDirectory = async () => {
  try {
    const handle = await window.showDirectoryPicker();
    dirHandle.value = handle;
    await loadFiles();
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Failed to open directory:', err);
      alert('无法打开目录: ' + err.message);
    }
  }
};

// 2. Load Files
const loadFiles = async () => {
  if (!dirHandle.value) return;
  // If we are reloading from the same dirHandle, we might want to keep existing files if they match?
  // But usually openDirectory implies a reset.
  // However, drag and drop adds files.
  // Let's reset if openDirectory is called.
  files.value = [];
  try {
    for await (const entry of dirHandle.value.values()) {
      if (shouldAddEntry(entry)) {
        addFileEntry(entry);
      }
    }
    sortFiles();
    applyRules();
  } catch (err) {
    console.error('Error reading directory:', err);
    alert('读取目录失败: ' + err.message);
  }
};

const shouldAddEntry = (entry) => {
  if (targetMode.value === 'file') return entry.kind === 'file';
  if (targetMode.value === 'folder') return entry.kind === 'directory';
  return false;
};

const addFileEntry = (entry) => {
  // Avoid duplicates
  if (files.value.some(f => f.handle.name === entry.name && f.handle.isSameEntry && f.handle.isSameEntry(entry))) {
    return;
  }
  
  files.value.push({
    id: Math.random().toString(36).substr(2, 9),
    handle: entry,
    originalName: entry.name,
    newName: entry.name,
    status: 'idle', // idle, success, error
    error: null,
    selected: true
  });
};

const sortFiles = () => {
   files.value.sort((a, b) => a.originalName.localeCompare(b.originalName));
};

// Toggle Mode
const setMode = (mode) => {
  if (targetMode.value === mode) return;
  targetMode.value = mode;
  // Reload files if directory is open
  if (dirHandle.value) {
    loadFiles();
  } else {
    files.value = []; // Clear if no directory but maybe dropped files?
  }
};

// Clear List
const clearList = () => {
  files.value = [];
  dirHandle.value = null; // Also clear dir handle since list is gone? Or just list? 
  // User asked for "Clear List", usually implies clearing loaded content.
};

// Drag and Drop
const onDragEnter = (e) => {
  dragCounter.value++;
  isDragging.value = true;
};

const onDragLeave = (e) => {
  dragCounter.value--;
  if (dragCounter.value <= 0) {
    dragCounter.value = 0;
    isDragging.value = false;
  }
};

const handleDrop = async (e) => {
  dragCounter.value = 0;
  isDragging.value = false;
  const items = [...e.dataTransfer.items];
  
  let hasAdded = false;
  for (const item of items) {
    if (item.kind === 'file') {
      try {
        const handle = await item.getAsFileSystemHandle();
        if (handle) {
          if (handle.kind === 'directory') {
            // If mode is folder, add this folder?
            // If mode is file, add files inside?
            // User said "drag file or folder".
            
            if (targetMode.value === 'folder') {
               // Add the dropped folder itself?
               // Usually when you drop a folder in "Folder Mode", you want to rename that folder?
               // Or you want to rename subfolders of that folder?
               // Let's assume:
               // File Mode -> Add files inside (recursive)
               // Folder Mode -> Add subfolders inside? Or add the folder itself?
               // Usually renaming tools operate on a list.
               // If I drop a folder "Photos", and mode is "Folder", do I want to rename "Photos"?
               // Yes.
               
               // But wait, if I drop "Photos" containing "A", "B".
               // If I want to rename "A" and "B", I should drop "Photos" and expect "A" and "B" to appear?
               // Or should "Photos" appear?
               // Standard behavior: 
               // Drop folder -> Load its content (files or subfolders depending on mode).
               // Exception: If I drag *multiple* folders from Explorer.
               // "Photos", "Work".
               // They appear in the list.
               
               // Let's stick to "Load content of dropped folder" if it's a single folder drop?
               // Or "Add dropped item to list"?
               
               // Current logic for files:
               // Drop folder -> Recursively add files.
               
               // Logic for folders:
               // Drop folder -> Add immediate subfolders? Or add the dropped folder itself?
               // If I drop "C:\Data", I probably want to rename items inside Data.
               
               // Let's go with: Process dropped item.
               // If it matches mode, add it.
               // If it's a directory and we need to recurse (File Mode), recurse.
               // If it's a directory and we are in Folder Mode:
               // Should we add the directory itself or its children?
               // If I drop 10 folders, I want those 10 folders in the list.
               // If I drop 1 parent folder, I might want its children.
               // This is ambiguous.
               // Let's assume "Add what is dropped".
               // But for a folder drop in File Mode, we MUST recurse to find files.
               
               if (targetMode.value === 'file') {
                 await processDirectory(handle); // Adds files recursively
                 hasAdded = true;
               } else {
                 // Folder Mode
                 // If I drop a folder, add it.
                 addFileEntry(handle);
                 hasAdded = true;
                 // Should we also look inside? No, usually not for "Folder Renaming".
                 // Unless the user wants to batch rename subfolders.
                 // Let's stick to "Add dropped item".
               }

            } else {
               // File Mode
               if (handle.kind === 'directory') {
                  await processDirectory(handle);
                  hasAdded = true;
               } else {
                  addFileEntry(handle);
                  hasAdded = true;
               }
            }
          } else if (handle.kind === 'file') {
            if (targetMode.value === 'file') {
              addFileEntry(handle);
              hasAdded = true;
            }
          }
        }
      } catch (err) {
        console.warn('Failed to process drop item:', err);
      }
    }
  }
  
  if (hasAdded) {
    sortFiles();
    applyRules();
  }
};

const processDirectory = async (dirHandle) => {
  for await (const entry of dirHandle.values()) {
    if (shouldAddEntry(entry)) {
      addFileEntry(entry);
    } else if (entry.kind === 'directory' && targetMode.value === 'file') {
       // Recurse for files
       await processDirectory(entry);
    }
  }
};

// 3. Rule Management
const addStep = (type) => {
  const id = Math.random().toString(36).substr(2, 9);
  let params = {};
  
  switch (type) {
    case 'replace':
      params = { find: '', replace: '', useRegex: false, caseSensitive: false, global: true };
      break;
    case 'add':
      params = { text: '', position: 'start' }; // start, end
      break;
    case 'insert':
      params = { text: '', index: 0, fromEnd: false };
      break;
    case 'delete':
      params = { start: 0, count: 1, fromEnd: false };
      break;
    case 'numbering':
      params = { start: 1, step: 1, padding: 3, position: 'end', separator: '-' };
      break;
    case 'format':
      params = { type: 'lowercase' }; // lowercase, uppercase, capitalize
      break;
    case 'trim':
      params = { type: 'both' }; // both, start, end
      break;
    case 'extension':
      params = { newExt: '' };
      break;
  }
  
  steps.value.push({ id, type, params, active: true });
  isMenuOpen.value = false; // Close menu after adding
};

const removeStep = (index) => {
  steps.value.splice(index, 1);
};

// Step Sorting
const onStepDragStart = (e, index) => {
  draggedStepIndex.value = index;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.dropEffect = 'move';
  // Use setTimeout to allow the drag image to be generated before adding the class
  setTimeout(() => {
    if (e.target) e.target.classList.add('is-dragging');
  }, 0);
};

const onStepDragEnd = (e) => {
  if (e.target) e.target.classList.remove('is-dragging');
  draggedStepIndex.value = null;
};

// Real-time swapping for smooth animation
const onStepDragEnter = (e, index) => {
  e.preventDefault();
  if (draggedStepIndex.value === null) return;
  if (draggedStepIndex.value === index) return;
  
  // Throttle swaps to avoid flickering during animation
  const now = Date.now();
  if (now - lastSwapTime.value < 200) return; // 200ms cooldown matches animation speed roughly
  
  // Swap in data array
  const stepToMove = steps.value[draggedStepIndex.value];
  steps.value.splice(draggedStepIndex.value, 1);
  steps.value.splice(index, 0, stepToMove);
  
  // Update index to track the item in its new position
  draggedStepIndex.value = index;
  lastSwapTime.value = now;
};

const onStepDragOver = (e) => {
  e.preventDefault(); // Necessary to allow dropping
};

// Drop just cleans up if needed, but swapping happens in DragEnter
const onStepDrop = (e) => {
  e.preventDefault();
  draggedStepIndex.value = null;
};

// 4. Preview Calculation (Core Logic)
const applyRules = () => {
  if (!files.value.length) return;

  // Filter valid steps
  const activeSteps = steps.value.filter(s => s.active);

  // Separate files that need numbering from others if needed, 
  // but for simplicity we iterate all files and maintain a counter.
  
  // We need to know the index of the file in the *filtered* list for numbering?
  // Usually numbering applies to the visible list or all files. 
  // Let's apply to all files for now.

  files.value.forEach((file, index) => {
    // Reset to original name first
    let currentName = file.originalName;
    let nameWithoutExt = currentName.substring(0, currentName.lastIndexOf('.')) || currentName;
    let ext = currentName.substring(currentName.lastIndexOf('.')) || '';

    // If file has no extension (lastIndexOf is -1), ext is empty if we handle logic right.
    if (currentName.lastIndexOf('.') === -1) {
        nameWithoutExt = currentName;
        ext = '';
    }

    activeSteps.forEach(step => {
      try {
        switch (step.type) {
          case 'replace': {
            const { find, replace, useRegex, caseSensitive, global } = step.params;
            if (!find) break;
            
            let flags = '';
            if (global) flags += 'g';
            if (!caseSensitive) flags += 'i';

            if (useRegex) {
              try {
                const regex = new RegExp(find, flags);
                // Apply to nameWithoutExt to preserve extension usually? 
                // Or apply to whole name? Usually whole name is more flexible but dangerous for ext.
                // Let's apply to whole name for Replace, as user might want to change ext too.
                currentName = currentName.replace(regex, replace);
              } catch (e) {
                // Invalid regex, ignore
              }
            } else {
               if (global) {
                  currentName = currentName.replaceAll(find, replace);
               } else {
                  currentName = currentName.replace(find, replace);
               }
            }
            // Update parts
            const lastDot = currentName.lastIndexOf('.');
            if (lastDot !== -1) {
                nameWithoutExt = currentName.substring(0, lastDot);
                ext = currentName.substring(lastDot);
            } else {
                nameWithoutExt = currentName;
                ext = '';
            }
            break;
          }
          
          case 'add': {
            const { text, position } = step.params;
            if (!text) break;
            if (position === 'start') {
              nameWithoutExt = text + nameWithoutExt;
            } else {
              nameWithoutExt = nameWithoutExt + text;
            }
            currentName = nameWithoutExt + ext;
            break;
          }

          case 'insert': {
             const { text, index, fromEnd } = step.params;
             if (!text) break;
             let pos = index;
             if (fromEnd) {
                pos = nameWithoutExt.length - index;
                if (pos < 0) pos = 0;
             }
             // Ensure within bounds
             if (pos > nameWithoutExt.length) pos = nameWithoutExt.length;
             
             nameWithoutExt = nameWithoutExt.slice(0, pos) + text + nameWithoutExt.slice(pos);
             currentName = nameWithoutExt + ext;
             break;
          }

          case 'delete': {
             const { start, count, fromEnd } = step.params;
             let pos = start;
             if (fromEnd) {
                // If from end, 'start' means 'start offset from end'
                // e.g. start=0 means delete from last char? 
                // Let's assume start=0 fromEnd means start at length-0? 
                // Usually delete from index N. 
                // Let's say: delete N chars starting at index I.
                // If fromEnd, index I = length - start - count? Or length - start?
                // Simple: Index from end.
                pos = nameWithoutExt.length - start - count; 
                // If start=1, count=1. length=5. pos = 5-1-1 = 3. Delete char at 3.
             }
             
             if (pos < 0) pos = 0;
             if (pos >= nameWithoutExt.length) break;

             // Logic: slice(0, pos) + slice(pos + count)
             nameWithoutExt = nameWithoutExt.slice(0, pos) + nameWithoutExt.slice(pos + count);
             currentName = nameWithoutExt + ext;
             break;
          }

          case 'trim': {
             const { type } = step.params;
             if (type === 'both') nameWithoutExt = nameWithoutExt.trim();
             if (type === 'start') nameWithoutExt = nameWithoutExt.trimStart();
             if (type === 'end') nameWithoutExt = nameWithoutExt.trimEnd();
             currentName = nameWithoutExt + ext;
             break;
          }

          case 'numbering': {
            const { start, step: numStep, padding, position, separator } = step.params;
            const num = start + (index * numStep);
            const numStr = num.toString().padStart(padding, '0');
            
            if (position === 'start') {
               nameWithoutExt = `${numStr}${separator}${nameWithoutExt}`;
            } else {
               nameWithoutExt = `${nameWithoutExt}${separator}${numStr}`;
            }
            currentName = nameWithoutExt + ext;
            break;
          }

          case 'format': {
            const { type } = step.params;
            if (type === 'lowercase') nameWithoutExt = nameWithoutExt.toLowerCase();
            if (type === 'uppercase') nameWithoutExt = nameWithoutExt.toUpperCase();
            if (type === 'capitalize') {
                nameWithoutExt = nameWithoutExt.replace(/\b\w/g, l => l.toUpperCase());
            }
            currentName = nameWithoutExt + ext;
            break;
          }

          case 'extension': {
             const { newExt } = step.params;
             if (newExt) {
                // Ensure dot
                ext = newExt.startsWith('.') ? newExt : `.${newExt}`;
                currentName = nameWithoutExt + ext;
             }
             break;
          }
        }
      } catch (e) {
        console.warn('Step failed', e);
      }
    });

    file.newName = currentName;
  });
};

watch([files, steps], () => {
  // Only re-apply if we are not processing to avoid loops if we update status
  if (!isProcessing.value) {
    applyRules();
  }
}, { deep: true });

// 5. Execute Rename
const executeRename = async () => {
  const changedFiles = files.value.filter(f => f.selected && f.newName !== f.originalName && f.status !== 'success');
  if (changedFiles.length === 0) {
    alert('没有选中且需要重命名的文件。');
    return;
  }

  if (!confirm(`确定要重命名 ${changedFiles.length} 个项目吗？此操作不可撤销。`)) return;

  isProcessing.value = true;
  
  for (const file of changedFiles) {
    try {
      file.status = 'pending';
      
      // Check if move is supported
      if (file.handle.move) {
        await file.handle.move(file.newName);
      } else {
        // Polyfill for browsers that don't support handle.move()
        if (file.handle.kind === 'file') {
            // Create new file, copy content, delete old file
            // Note: We need parent handle to create new file? 
            // We have global dirHandle, but that might not be the direct parent if we recursed.
            // If we don't have direct parent handle, we can't easily rename if move() is missing.
            // However, most browsers supporting File System Access API support move() now (Chrome/Edge).
            // Fallback for subdirectories is tricky without parent handle.
            // But 'move' on handle is the standard way now.
             
            // If dirHandle is the parent:
            if (dirHandle.value) {
                // This assumes file is direct child of dirHandle. 
                // If recursive, this might fail or create file in root.
                // Let's assume move() works or we are in flat mode for fallback.
                 const newHandle = await dirHandle.value.getFileHandle(file.newName, { create: true });
                 const writable = await newHandle.createWritable();
                 const fileData = await file.handle.getFile();
                 await writable.write(fileData);
                 await writable.close();
                 await dirHandle.value.removeEntry(file.originalName);
            } else {
                 throw new Error("无法执行重命名: 浏览器不支持且无法获取父目录");
            }
        } else {
            // Directory rename fallback? 
            // Cannot easily copy directory.
             throw new Error("当前浏览器不支持文件夹重命名");
        }
      }
      
      file.status = 'success';
      file.originalName = file.newName; // Update original name to reflect reality
    } catch (err) {
      console.error(err);
      file.status = 'error';
      file.error = err.message;
    }
  }
  
  isProcessing.value = false;
  // Refresh list? No, we updated originalName, so it should be fine.
  // Trigger re-calc just in case
  applyRules();
};

// --- Computed ---
const previewFiles = computed(() => {
  if (!filterText.value) return files.value;
  return files.value.filter(f => 
    f.originalName.toLowerCase().includes(filterText.value.toLowerCase()) || 
    f.newName.toLowerCase().includes(filterText.value.toLowerCase())
  );
});

const stats = computed(() => {
  const total = files.value.length;
  const changed = files.value.filter(f => f.selected && f.newName !== f.originalName).length;
  return { total, changed };
});

const isAllSelected = computed({
  get: () => files.value.length > 0 && files.value.every(f => f.selected),
  set: (val) => files.value.forEach(f => f.selected = val)
});

const isIndeterminate = computed(() => {
  const selectedCount = files.value.filter(f => f.selected).length;
  return selectedCount > 0 && selectedCount < files.value.length;
});

</script>

<template>
  <div class="h-screen flex flex-col bg-gray-50 overflow-hidden">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <div class="bg-indigo-600 p-2 rounded-lg text-white">
          <DocumentIcon class="w-6 h-6" />
        </div>
        <h1 class="text-xl font-bold text-gray-800">批量重命名工具</h1>
        
        <!-- Mode Switch -->
        <div class="ml-6 flex bg-gray-100 p-1 rounded-lg">
           <button 
             @click="setMode('file')"
             :class="['px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2', targetMode === 'file' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700']"
           >
             <DocumentIcon class="w-4 h-4" />
             文件模式
           </button>
           <button 
             @click="setMode('folder')"
             :class="['px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2', targetMode === 'folder' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700']"
           >
             <FolderIcon class="w-4 h-4" />
             文件夹模式
           </button>
        </div>
      </div>
      
      <div class="flex items-center gap-4">
        <div class="text-sm text-gray-500" v-if="dirHandle">
          已加载: <span class="font-medium text-gray-900">{{ dirHandle.name }}</span>
        </div>
        <button 
           v-if="files.length > 0"
           @click="clearList"
           class="px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          清空列表
        </button>
        <button 
          @click="openDirectory"
          class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <FolderOpenIcon class="w-5 h-5" />
          打开目录
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
      
      <!-- Sidebar: Rules -->
      <aside class="w-96 bg-white border-r border-gray-200 flex flex-col z-10 shadow-lg">
        <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 class="font-semibold text-gray-700">处理步骤</h2>
          <div class="relative">
            <button 
              @click.stop="isMenuOpen = !isMenuOpen"
              class="add-step-btn text-indigo-600 hover:text-indigo-800 p-1 rounded hover:bg-indigo-50 transition-colors"
            >
              <PlusIcon class="w-6 h-6" />
            </button>
            <!-- Dropdown -->
            <div 
              v-if="isMenuOpen"
              class="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden"
            >
              <button 
                v-for="type in STEP_TYPES" 
                :key="type.value"
                @click="addStep(type.value)"
                class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 border-b border-gray-50 last:border-0"
              >
                {{ type.label }}
              </button>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 relative">
          <div v-if="steps.length === 0" class="text-center text-gray-400 py-10">
            <p>暂无规则</p>
            <p class="text-sm">点击右上角 + 添加处理步骤</p>
          </div>

          <transition-group name="list" tag="div" class="space-y-4">
            <div 
              v-for="(step, index) in steps" 
              :key="step.id"
              class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-md cursor-move step-item"
              draggable="true"
              @dragstart="onStepDragStart($event, index)"
              @dragend="onStepDragEnd"
              @dragover="onStepDragOver"
              @dragenter="onStepDragEnter($event, index)"
              @drop="onStepDrop"
            >
              <!-- Step Header -->
              <div class="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-100">
                <div class="flex items-center gap-2">
                  <Bars2Icon class="w-4 h-4 text-gray-400 cursor-grab active:cursor-grabbing" />
                  <input type="checkbox" v-model="step.active" class="rounded text-indigo-600 focus:ring-indigo-500" />
                  <span class="font-medium text-sm text-gray-700">
                    {{ STEP_TYPES.find(t => t.value === step.type)?.label }}
                  </span>
                </div>
                <button @click="removeStep(index)" class="text-gray-400 hover:text-red-500">
                  <XMarkIcon class="w-4 h-4" />
                </button>
              </div>

              <!-- Step Body -->
              <div class="p-4 space-y-3">
                <!-- Replace -->
                <div v-if="step.type === 'replace'" class="space-y-3">
                  <div>
                    <label class="text-xs text-gray-500 block mb-1">查找</label>
                    <input v-model="step.params.find" type="text" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" placeholder="查找内容..." />
                  </div>
                  <div>
                    <label class="text-xs text-gray-500 block mb-1">替换为</label>
                    <input v-model="step.params.replace" type="text" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" placeholder="留空则删除" />
                  </div>
                  <div class="flex gap-4">
                     <label class="flex items-center gap-1 text-xs text-gray-600">
                       <input type="checkbox" v-model="step.params.useRegex" /> 正则
                     </label>
                     <label class="flex items-center gap-1 text-xs text-gray-600">
                       <input type="checkbox" v-model="step.params.global" /> 全局
                     </label>
                  </div>
                </div>

                <!-- Add -->
                <div v-if="step.type === 'add'" class="space-y-3">
                   <div>
                    <label class="text-xs text-gray-500 block mb-1">文本内容</label>
                    <input v-model="step.params.text" type="text" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded" />
                  </div>
                  <div>
                    <label class="text-xs text-gray-500 block mb-1">位置</label>
                    <select v-model="step.params.position" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded">
                      <option value="start">文件名前缀</option>
                      <option value="end">文件名后缀</option>
                    </select>
                  </div>
                </div>

                <!-- Insert -->
                <div v-if="step.type === 'insert'" class="space-y-3">
                   <div>
                    <label class="text-xs text-gray-500 block mb-1">插入文本</label>
                    <input v-model="step.params.text" type="text" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded" />
                  </div>
                   <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="text-xs text-gray-500 block mb-1">位置索引</label>
                        <input v-model.number="step.params.index" type="number" class="w-full px-2 py-1.5 text-sm border rounded" />
                      </div>
                       <div class="flex items-center pt-5">
                        <label class="flex items-center gap-1 text-xs text-gray-600">
                          <input type="checkbox" v-model="step.params.fromEnd" /> 从尾部计算
                        </label>
                      </div>
                   </div>
                </div>

                <!-- Delete -->
                <div v-if="step.type === 'delete'" class="space-y-3">
                   <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="text-xs text-gray-500 block mb-1">起始索引</label>
                        <input v-model.number="step.params.start" type="number" class="w-full px-2 py-1.5 text-sm border rounded" />
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 block mb-1">删除长度</label>
                        <input v-model.number="step.params.count" type="number" class="w-full px-2 py-1.5 text-sm border rounded" />
                      </div>
                   </div>
                   <div>
                      <label class="flex items-center gap-1 text-xs text-gray-600">
                          <input type="checkbox" v-model="step.params.fromEnd" /> 从尾部计算起始位置
                      </label>
                   </div>
                </div>

                <!-- Trim -->
                 <div v-if="step.type === 'trim'" class="space-y-3">
                  <div>
                    <label class="text-xs text-gray-500 block mb-1">去除方式</label>
                    <select v-model="step.params.type" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded">
                      <option value="both">两端空格 (Trim Both)</option>
                      <option value="start">头部空格 (Trim Start)</option>
                      <option value="end">尾部空格 (Trim End)</option>
                    </select>
                  </div>
                </div>

                <!-- Numbering -->
                <div v-if="step.type === 'numbering'" class="space-y-3">
                   <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="text-xs text-gray-500 block mb-1">起始</label>
                        <input v-model.number="step.params.start" type="number" class="w-full px-2 py-1.5 text-sm border rounded" />
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 block mb-1">增量</label>
                        <input v-model.number="step.params.step" type="number" class="w-full px-2 py-1.5 text-sm border rounded" />
                      </div>
                   </div>
                   <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="text-xs text-gray-500 block mb-1">位数(0填充)</label>
                        <input v-model.number="step.params.padding" type="number" class="w-full px-2 py-1.5 text-sm border rounded" />
                      </div>
                       <div>
                        <label class="text-xs text-gray-500 block mb-1">连接符</label>
                        <input v-model="step.params.separator" type="text" class="w-full px-2 py-1.5 text-sm border rounded" />
                      </div>
                   </div>
                   <div>
                    <label class="text-xs text-gray-500 block mb-1">位置</label>
                    <select v-model="step.params.position" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded">
                      <option value="end">尾部</option>
                      <option value="start">头部</option>
                    </select>
                  </div>
                </div>

                 <!-- Format -->
                <div v-if="step.type === 'format'" class="space-y-3">
                  <div>
                    <label class="text-xs text-gray-500 block mb-1">格式</label>
                    <select v-model="step.params.type" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded">
                      <option value="lowercase">全部小写 (lowercase)</option>
                      <option value="uppercase">全部大写 (UPPERCASE)</option>
                      <option value="capitalize">首字母大写 (Capitalize)</option>
                    </select>
                  </div>
                </div>
                
                <!-- Extension -->
                 <div v-if="step.type === 'extension'" class="space-y-3">
                  <div>
                    <label class="text-xs text-gray-500 block mb-1">新扩展名</label>
                    <input v-model="step.params.newExt" type="text" class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded" placeholder=".jpg" />
                  </div>
                </div>

              </div>
            </div>
          </transition-group>
        </div>

        <!-- Action Footer -->
        <div class="p-4 border-t border-gray-200 bg-white">
          <button 
            @click="executeRename"
            :disabled="isProcessing || stats.changed === 0"
            class="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-lg shadow-indigo-200"
          >
            <ArrowPathIcon v-if="isProcessing" class="w-5 h-5 animate-spin" />
            <PlayIcon v-else class="w-5 h-5" />
            {{ isProcessing ? '正在处理...' : `重命名 ${stats.changed} 个文件` }}
          </button>
        </div>
      </aside>

      <!-- Main: File List -->
      <main 
        class="flex-1 flex flex-col bg-white overflow-hidden relative"
        @dragenter.prevent="onDragEnter"
        @dragover.prevent="onDragEnter" 
        @dragleave.prevent="onDragLeave"
        @drop.prevent="handleDrop"
      >
        <!-- Drag Overlay -->
        <div v-if="isDragging" class="absolute inset-0 bg-indigo-50/90 z-50 flex flex-col items-center justify-center border-4 border-indigo-200 border-dashed m-4 rounded-xl pointer-events-none">
           <ArrowDownTrayIcon class="w-20 h-20 text-indigo-500 mb-4 animate-bounce" />
           <p class="text-xl font-bold text-indigo-700">释放以添加{{ targetMode === 'file' ? '文件' : '文件夹' }}</p>
        </div>

        <!-- Toolbar -->
        <div class="px-6 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <div class="text-sm text-gray-600">
            共 <span class="font-bold">{{ stats.total }}</span> 个项目，
            <span class="text-indigo-600 font-bold">{{ stats.changed }}</span> 个将变更
          </div>
          <div class="relative">
            <input 
              v-model="filterText"
              type="text" 
              placeholder="搜索..." 
              class="pl-8 pr-4 py-1.5 text-sm border border-gray-300 rounded-full focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none w-64"
            />
             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 absolute left-2.5 top-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <!-- Table Header -->
        <div class="grid grid-cols-12 px-6 py-3 bg-gray-100 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider items-center">
          <div class="col-span-5 flex items-center gap-3">
             <input 
               type="checkbox" 
               v-model="isAllSelected"
               :indeterminate="isIndeterminate"
               class="rounded text-indigo-600 focus:ring-indigo-500" 
             />
             原名称
          </div>
          <div class="col-span-1 text-center"></div>
          <div class="col-span-5">新名称</div>
          <div class="col-span-1 text-right">状态</div>
        </div>

        <!-- Table Body -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="files.length === 0" class="h-full flex flex-col items-center justify-center text-gray-400">
            <component :is="targetMode === 'file' ? DocumentIcon : FolderIcon" class="w-16 h-16 mb-4 opacity-20" />
            <p>请打开文件夹或拖入{{ targetMode === 'file' ? '文件' : '文件夹' }}</p>
          </div>
          
          <template v-else>
             <div 
              v-for="file in previewFiles" 
              :key="file.id"
              class="grid grid-cols-12 px-6 py-3 border-b border-gray-100 hover:bg-gray-50 items-center text-sm transition-colors group"
              :class="{'opacity-50': !file.selected}"
            >
              <div class="col-span-5 truncate text-gray-600 flex items-center gap-3" :title="file.originalName">
                <input 
                  type="checkbox" 
                  v-model="file.selected"
                  class="rounded text-indigo-600 focus:ring-indigo-500" 
                />
                <span class="truncate">{{ file.originalName }}</span>
              </div>
              
              <div class="col-span-1 flex justify-center text-gray-400">
                <svg v-if="file.selected && file.originalName !== file.newName" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
              
              <div class="col-span-5 truncate font-medium" :class="file.selected && file.originalName !== file.newName ? 'text-indigo-600' : 'text-gray-900'" :title="file.newName">
                {{ file.newName }}
              </div>
              
              <div class="col-span-1 flex justify-end">
                <span v-if="file.status === 'success'" class="text-green-500 flex items-center gap-1">
                  <CheckCircleIcon class="w-5 h-5" />
                </span>
                <span v-else-if="file.status === 'error'" class="text-red-500 flex items-center gap-1" :title="file.error">
                  <XCircleIcon class="w-5 h-5" />
                </span>
                <span v-else-if="file.status === 'pending'" class="text-gray-400">
                  <ArrowPathIcon class="w-5 h-5 animate-spin" />
                </span>
                <span v-else class="text-gray-300">-</span>
              </div>
            </div>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* Custom Scrollbar for nicer UI */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* List Transitions */
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.list-leave-active {
  position: absolute;
  width: 100%; /* Ensure it doesn't shrink when leaving */
  z-index: 0; /* Keep behind moving items */
}

/* Dragging visual feedback */
.step-item.is-dragging {
  opacity: 0.3;
  background: #f1f5f9;
  border: 2px dashed #cbd5e1;
}

/* Ensure container has relative positioning for absolute leave items */
.relative {
  position: relative;
}
</style>
