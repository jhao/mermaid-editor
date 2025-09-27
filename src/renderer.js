// ================ 导入依赖 ================
const { EditorState } = require("@codemirror/state")
const { EditorView } = require("@codemirror/view")
const { dialog } = require('@electron/remote')
const fs = require('fs')
const { StreamLanguage } = require("@codemirror/language")
const { markdown } = require("@codemirror/lang-markdown")
const { history, historyKeymap } = require("@codemirror/commands")
const GraphEditorModule = require('./graphEditorModule')

// ================ 类型定义 ================
/**
 * @typedef {Object} ViewState
 * @property {number} scale - 缩放比例
 * @property {number} translateX - X轴平移距离
 * @property {number} translateY - Y轴平移距离
 */

// ================ 常量定义 ================
const CONSTANTS = {
    SCALE: {
        MIN: 0.5,
        MAX: 3,
        STEP: 0.1,
        DEFAULT: 1
    },
    PANEL: {
        MIN_WIDTH: 200
    }
}

// ================ 全局状态 ================
const globalState = {
    editor: null,
    mermaidOutput: document.getElementById('mermaidOutput'),
    errorMessage: document.getElementById('error-message')
}

const modeState = {
    isGraphMode: false,
    textContainer: null,
    graphContainer: null
}

// ================ Mermaid 配置 ================
mermaid.initialize({ 
    startOnLoad: true,
    theme: 'default',
    securityLevel: 'loose'
})

// ================ 编辑器相关 ================
const EditorModule = {
    init() {
        globalState.editor = new EditorView({
            state: EditorState.create({
                doc: "graph TD\n    A[开始] --> B[结束]",
                extensions: [
                    markdown(),
                    EditorView.lineWrapping,
                    this.getTheme(),
                    this.getEventListener()
                ]
            }),
            parent: document.getElementById("editor")
        })
    },

    getTheme() {
        return EditorView.theme({
            "&": {
                height: "calc(100vh - 100px)",
                overflow: "auto"
            },
            ".cm-content": {
                fontFamily: "monospace"
            },
            ".cm-line": {
                padding: "0 3px",
                lineHeight: "1.6"
            }
        })
    },

    getEventListener() {
        return EditorView.updateListener.of(update => {
            if (update.focusChanged && !update.view.hasFocus) {
                const content = update.state.doc.toString()
                renderMermaid(content)
                console.log('编辑器失去焦点，更新图表')
            }
        })
    }
}

// ================ 文件操作相关 ================
const FileModule = {
    init() {
        document.getElementById('newFile').addEventListener('click', this.handleNew)
        document.getElementById('openFile').addEventListener('click', this.handleOpen)
        document.getElementById('saveFile').addEventListener('click', () => handleSave(globalState.editor))
        document.getElementById('exportSVG').addEventListener('click', () => handleExportSVG(globalState.mermaidOutput))
        document.getElementById('exportPNG').addEventListener('click', () => handleExportPNG(globalState.mermaidOutput))
    },

    handleNew() {
        console.log('点击新建文件按钮')
        globalState.editor.dispatch({
            changes: {
                from: 0,
                to: globalState.editor.state.doc.length,
                insert: ''
            }
        })
    },

    async handleOpen() {
        console.log('点击打开文件按钮')
        const result = await dialog.showOpenDialog({
            filters: [
                { name: 'Mermaid Files', extensions: ['mmd', 'txt'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        })

        if (!result.canceled && result.filePaths.length > 0) {
            const content = fs.readFileSync(result.filePaths[0], 'utf-8')
            editor.dispatch({
                changes: {
                    from: 0,
                    to: editor.state.doc.length,
                    insert: content
                }
            })
            console.log(`已打开文件: ${result.filePaths[0]}`)
        }
    }
}

async function handleSave(editor) {
    console.log('点击保存文件按钮')
    const result = await dialog.showSaveDialog({
        filters: [{ name: 'Mermaid Files', extensions: ['mmd'] }]
    })

    if (!result.canceled) {
        fs.writeFileSync(result.filePath, editor.state.doc.toString())
        console.log(`文件已保存: ${result.filePath}`)
    }
}

async function handleExportSVG(mermaidOutput) {
    console.log('点击导出SVG按钮')
    const result = await dialog.showSaveDialog({
        filters: [{ name: 'SVG Files', extensions: ['svg'] }]
    })

    if (!result.canceled && mermaidOutput) {
        // 获取SVG元素
        const svg = mermaidOutput.querySelector('svg')
        if (!svg) {
            console.error('未找到SVG元素')
            return
        }
        
        // 添加XML声明和DOCTYPE
        const svgContent = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
                         '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
                         svg.outerHTML
        
        fs.writeFileSync(result.filePath, svgContent, 'utf-8')
        console.log(`SVG已导出: ${result.filePath}`)
    }
}

async function handleExportPNG(mermaidOutput) {
    console.log('点击导出PNG按钮')
    try {
        const source = globalState.editor.state.doc.toString()
        
        // 使用mermaid渲染新的SVG
        const { svg } = await mermaid.render('mermaid-export', source)
        
        // 创建一个临时的容器
        const tempContainer = document.createElement('div')
        tempContainer.style.visibility = 'hidden'
        tempContainer.style.position = 'absolute'
        tempContainer.style.left = '-9999px'
        document.body.appendChild(tempContainer)
        tempContainer.innerHTML = svg
        
        // 获取SVG元素
        const svgElement = tempContainer.querySelector('svg')
        if (!svgElement) {
            throw new Error('无法生成SVG')
        }
        
        // 获取SVG的尺寸
        const svgWidth = svgElement.viewBox.baseVal.width || svgElement.width.baseVal.value || 800
        const svgHeight = svgElement.viewBox.baseVal.height || svgElement.height.baseVal.value || 600
        
        // 设置SVG的尺寸
        svgElement.setAttribute('width', svgWidth)
        svgElement.setAttribute('height', svgHeight)
        
        // 将SVG转换为base64编码的数据URL
        const svgString = new XMLSerializer().serializeToString(svgElement)
        const svgBase64 = btoa(unescape(encodeURIComponent(svgString)))
        const dataUrl = `data:image/svg+xml;base64,${svgBase64}`
        
        // 创建图片并等待加载
        const img = new Image()
        await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
            img.src = dataUrl
        })
        
        // 创建canvas
        const canvas = document.createElement('canvas')
        canvas.width = svgWidth * 2  // 增加分辨率
        canvas.height = svgHeight * 2
        
        const ctx = canvas.getContext('2d')
        ctx.scale(2, 2)  // 设置缩放以提高清晰度
        
        // 绘制白色背景
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, svgWidth, svgHeight)
        
        // 绘制图像
        ctx.drawImage(img, 0, 0, svgWidth, svgHeight)
        
        // 导出对话框
        const result = await dialog.showSaveDialog({
            filters: [{ name: 'PNG Files', extensions: ['png'] }]
        })
        
        if (!result.canceled) {
            // 获取PNG数据并保存
            const pngData = canvas.toDataURL('image/png', 1.0)
            const base64Data = pngData.replace(/^data:image\/png;base64,/, '')
            fs.writeFileSync(result.filePath, Buffer.from(base64Data, 'base64'))
            console.log(`PNG已导出: ${result.filePath}`)
        }
        
        // 清理资源
        document.body.removeChild(tempContainer)
    } catch (error) {
        console.error('导出PNG时发生错误:', error)
    }
}

// ================ 主题相关 ================
// 初始化主题切换
function initThemeSwitch() {
    document.getElementById('themeSelect').addEventListener('change', (event) => {
        const theme = event.target.value
        console.log(`切换主题: ${theme}`)
        mermaid.initialize({ 
            startOnLoad: true,
            theme: theme
        })
        document.body.className = `theme-${theme}`
        renderMermaid(globalState.editor.state.doc.toString())
    })
}

// ================ Mermaid 图表相关 ================
// 渲染 Mermaid 图表
function renderMermaid(source) {
    const output = document.getElementById('mermaidOutput')
    const errorMessage = document.getElementById('error-message')
    
    output.innerHTML = ''
    errorMessage.classList.remove('show')
    
    try {
        mermaid.render('mermaid-diagram', source)
            .then(result => {
                output.innerHTML = result.svg
                initSvgInteraction(output)
            })
            .catch(error => {
                const errorMsg = `错误: ${error.message}`
                errorMessage.textContent = errorMsg
                errorMessage.classList.add('show')
                console.error(errorMsg)
            })
    } catch (error) {
        const errorMsg = `错误: ${error.message}`
        errorMessage.textContent = errorMsg
        errorMessage.classList.add('show')
        console.error(errorMsg)
    }
}

function updateMainEditorContent(newContent) {
    if (!globalState.editor) return
    const current = globalState.editor.state.doc.toString()
    if (current === newContent) return
    globalState.editor.dispatch({
        changes: {
            from: 0,
            to: globalState.editor.state.doc.length,
            insert: newContent
        }
    })
}

const ModeModule = {
    init() {
        modeState.textContainer = document.getElementById('textModeContainer')
        modeState.graphContainer = document.getElementById('graphEditorContainer')

        const openButton = document.getElementById('openGraphEditor')
        const exitButton = document.getElementById('exitGraphEditor')

        if (openButton) {
            openButton.addEventListener('click', () => this.enterGraphMode())
        }

        if (exitButton) {
            exitButton.addEventListener('click', () => this.enterTextMode())
        }
    },

    enterGraphMode() {
        if (modeState.isGraphMode) return
        modeState.isGraphMode = true
        if (modeState.textContainer) modeState.textContainer.classList.add('hidden')
        if (modeState.graphContainer) modeState.graphContainer.classList.remove('hidden')

        const source = globalState.editor ? globalState.editor.state.doc.toString() : ''
        GraphEditorModule.open(source)
    },

    enterTextMode() {
        if (!modeState.isGraphMode) return
        modeState.isGraphMode = false
        GraphEditorModule.close()
        if (modeState.graphContainer) modeState.graphContainer.classList.add('hidden')
        if (modeState.textContainer) modeState.textContainer.classList.remove('hidden')

        const mermaidText = GraphEditorModule.getCurrentMermaid()
        updateMainEditorContent(mermaidText)
        renderMermaid(mermaidText)
    }
}

function handleGraphMermaidChange(mermaidText) {
    if (!modeState.isGraphMode) return
    updateMainEditorContent(mermaidText)
    renderMermaid(mermaidText)
}

// ================ SVG 元素交互相关 ================
function initElementInteractions(svg) {
    const elements = svg.querySelectorAll('g.node, g.edge, g.cluster')
    
    elements.forEach(element => {
        // 添加点击选择功能
        element.addEventListener('click', (e) => {
            e.stopPropagation()
            // 移除其他元素的选中状态
            elements.forEach(el => el.classList.remove('selected'))
            // 添加当前元素的选中状态
            element.classList.add('selected')
        })

        // 添加右键菜单
        element.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()
            
            // 移除已存在的菜单
            const existingMenu = document.querySelector('.context-menu')
            if (existingMenu) {
                existingMenu.remove()
            }
            
            // 创建右键菜单
            const contextMenu = document.createElement('div')
            contextMenu.className = 'context-menu'
            
            // 根据元素类型显示不同的菜单选项
            if (element.classList.contains('cluster')) {
                contextMenu.innerHTML = `
                    <div class="menu-item">移动 Subgraph</div>
                    <div class="menu-item">调整大小</div>
                `
            } else {
                contextMenu.innerHTML = `
                    <div class="menu-item">移动位置</div>
                `
            }
            
            // 设置菜单位置
            contextMenu.style.left = `${e.clientX}px`
            contextMenu.style.top = `${e.clientY}px`
            document.body.appendChild(contextMenu)

            // 点击其他地方关闭菜单
            const closeMenu = (e) => {
                if (!contextMenu.contains(e.target)) {
                    contextMenu.remove()
                    document.removeEventListener('click', closeMenu)
                }
            }
            document.addEventListener('click', closeMenu)
        })
    })
}

// ================ SVG 交互相关 ================
// SVG 交互功能初始化
function initSvgInteraction(container) {
    const svg = container.querySelector('svg')
    if (!svg) return

    // 修改状态对象的初始化方式
    const state = {
        scale: 1,
        translateX: 0,
        translateY: 0,
        isMinimapDragging: false
    }
    
    initSvgZoom(container, svg, state)
    initSvgDrag(container, svg, state)
    initElementInteractions(svg)
    initMinimap(container, svg, state)
}

// 初始化缩放功能
function initSvgZoom(container, svg, state) {
    const scaleStep = 0.1
    const minScale = 0.5
    const maxScale = 3

    container.addEventListener('wheel', (e) => {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -scaleStep : scaleStep
        state.scale = Math.min(Math.max(state.scale + delta, minScale), maxScale)
        svg.style.transform = `scale(${state.scale}) translate(${state.translateX}px, ${state.translateY}px)`
        console.log(`图表缩放: ${Math.round(state.scale * 100)}%`)
    })
}

// 初始化拖拽功能
function initSvgDrag(container, svg, state) {
    let isDragging = false
    let startX, startY

    container.style.cursor = 'grab'
    svg.style.transformOrigin = 'center'
    svg.style.transition = 'transform 0.1s'

    container.addEventListener('mousedown', (e) => {
        // 如果小地图正在拖拽，不启动SVG拖拽
        if (state.isMinimapDragging) return;
        
        isDragging = true;
        startX = e.clientX - state.translateX;
        startY = e.clientY - state.translateY;
        container.style.cursor = 'grabbing';
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDragging) return
        state.translateX = e.clientX - startX
        state.translateY = e.clientY - startY
        svg.style.transform = `scale(${state.scale}) translate(${state.translateX}px, ${state.translateY}px)`
    })

    container.addEventListener('mouseup', () => {
        isDragging = false
        container.style.cursor = 'grab'
    })

    container.addEventListener('mouseleave', () => {
        isDragging = false
        container.style.cursor = 'grab'
    })
}

// ================ 小地图相关 ================
function initMinimap(container, svg, state) {
    const minimap = createMinimapElements()
    container.appendChild(minimap.container)
    
    initMinimapDrag(minimap.viewport, svg, state)
    updateMinimapViewport(container, svg, minimap, state)
    
    let isMinimapDragging = false // 添加小地图专用的拖拽状态变量
    
    // 在缩放和拖拽时更新小地图
    container.addEventListener('wheel', () => updateMinimapViewport(container, svg, minimap, state))
    container.addEventListener('mousemove', () => {
        if (isMinimapDragging) { // 使用小地图专用的拖拽状态变量
            updateMinimapViewport(container, svg, minimap, state)
        }
    })
}

// 添加小地图拖拽功能
function initMinimapDrag(viewport, svg, state) {
    let minimapDragging = false
    let minimapStartX, minimapStartY

    viewport.addEventListener('mousedown', (e) => {
        minimapDragging = true;
        minimapStartX = e.clientX - viewport.offsetLeft;
        minimapStartY = e.clientY - viewport.offsetTop;
        state.isMinimapDragging = true;
        e.stopPropagation();
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!minimapDragging) return
        
        e.stopPropagation()
        e.preventDefault()
        
        const containerRect = viewport.parentElement.getBoundingClientRect()
        const svgRect = svg.getBoundingClientRect()
        const scaleX = svgRect.width / viewport.parentElement.offsetWidth
        const scaleY = svgRect.height / viewport.parentElement.offsetHeight
        
        const x = e.clientX - minimapStartX
        const y = e.clientY - minimapStartY
        
        state.translateX = -(x * scaleX)
        state.translateY = -(y * scaleY)
        
        // 使用状态中保存的缩放值
        svg.style.transform = `scale(${state.scale}) translate(${state.translateX}px, ${state.translateY}px)`
        
        updateMinimapViewport(viewport.parentElement.parentElement, svg, {
            viewport,
            container: viewport.parentElement.parentElement,
            content: viewport.parentElement
        }, state)
    });

    document.addEventListener('mouseup', (e) => {
        if (minimapDragging) {
            e.stopPropagation();
            e.preventDefault();
        }
        minimapDragging = false;
        state.isMinimapDragging = false; // 清除全局状态标记
    });
}

// 更新小地图视口
function updateMinimapViewport(container, svg, minimap, state) {
    const containerRect = container.getBoundingClientRect()
    const svgRect = svg.getBoundingClientRect()
    
    // 计算缩放比例
    const scaleX = minimap.container.offsetWidth / svgRect.width
    const scaleY = minimap.container.offsetHeight / svgRect.height
    
    // 计算视口大小和位置
    const viewportWidth = Math.min(minimap.container.offsetWidth, 
                                 minimap.container.offsetWidth * (containerRect.width / svgRect.width))
    const viewportHeight = Math.min(minimap.container.offsetHeight, 
                                  minimap.container.offsetHeight * (containerRect.height / svgRect.height))
    
    // 计算视口位置
    const viewportX = (-state.translateX * scaleX) + (minimap.container.offsetWidth - viewportWidth) / 2
    const viewportY = (-state.translateY * scaleY) + (minimap.container.offsetHeight - viewportHeight) / 2
    
    // 更新视口样式
    minimap.viewport.style.width = `${viewportWidth}px`
    minimap.viewport.style.height = `${viewportHeight}px`
    minimap.viewport.style.left = `${viewportX}px`
    minimap.viewport.style.top = `${viewportY}px`
}

function createMinimapElements() {
    const container = document.createElement('div')
    container.className = 'minimap'
    
    const content = document.createElement('div')
    content.className = 'minimap-content'
    
    const viewport = document.createElement('div')
    viewport.className = 'minimap-viewport'
    
    content.appendChild(viewport)
    container.appendChild(content)
    
    return { container, content, viewport }
}

// ================ 面板拖拽相关 ================
// ...

// ================ 分隔条相关 ================
function initResizer() {
    const container = document.querySelector('.container');
    const editor = document.querySelector('.editor');
    const resizer = document.createElement('div');
    const preview = document.querySelector('.preview');
    
    resizer.className = 'resizer';
    container.insertBefore(resizer, preview);
    
    let isResizing = false;
    let startX;
    let startWidth;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.pageX;
        startWidth = editor.offsetWidth;
        container.classList.add('resizing');
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const width = startWidth + (e.pageX - startX);
        if (width >= CONSTANTS.PANEL.MIN_WIDTH) {
            editor.style.width = `${width}px`;
            editor.style.flex = 'none';
        }
    });
    
    document.addEventListener('mouseup', () => {
        isResizing = false;
        container.classList.remove('resizing');
    });
}

// 在文档加载完成后初始化所有功能
document.addEventListener('DOMContentLoaded', () => {
    EditorModule.init();
    FileModule.init();
    initThemeSwitch();
    initResizer(); // 添加分隔条初始化
    if (globalState.editor) {
        renderMermaid(globalState.editor.state.doc.toString())
    }
    GraphEditorModule.init({
        onMermaidChange: handleGraphMermaidChange
    })
    ModeModule.init()
    console.log("应用初始化完成")
});
