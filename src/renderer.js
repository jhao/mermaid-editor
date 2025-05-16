import { EditorState, EditorView, basicSetup } from "@codemirror/basic-setup"
import { javascript } from "@codemirror/lang-javascript"
import { autocompletion } from "@codemirror/autocomplete"
import { oneDark } from "@codemirror/theme-one-dark"

const { dialog } = require('@electron/remote')
const fs = require('fs')

const mermaidInput = document.getElementById('mermaidInput')
const mermaidOutput = document.getElementById('mermaidOutput')

// 初始化mermaid
mermaid.initialize({ 
    startOnLoad: true,
    theme: 'default',
    securityLevel: 'loose'
})

// 实时预览功能
mermaidInput.addEventListener('input', () => {
    const source = mermaidInput.value
    mermaidOutput.innerHTML = ''
    mermaid.render('mermaid-diagram', source)
        .then(result => {
            mermaidOutput.innerHTML = result.svg
        })
        .catch(error => {
            console.error('Error rendering mermaid diagram:', error)
        })
})

// 新建文件
document.getElementById('newFile').addEventListener('click', () => {
    mermaidInput.value = ''
    mermaidOutput.innerHTML = ''
})

// 打开文件
document.getElementById('openFile').addEventListener('click', async () => {
    const result = await dialog.showOpenDialog({
        filters: [
            { name: 'Mermaid Files', extensions: ['mmd', 'txt'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    })

    if (!result.canceled && result.filePaths.length > 0) {
        const content = fs.readFileSync(result.filePaths[0], 'utf-8')
        mermaidInput.value = content
        mermaidInput.dispatchEvent(new Event('input'))
    }
})

// 保存文件
document.getElementById('saveFile').addEventListener('click', async () => {
    const result = await dialog.showSaveDialog({
        filters: [
            { name: 'Mermaid Files', extensions: ['mmd'] }
        ]
    })

    if (!result.canceled) {
        fs.writeFileSync(result.filePath, mermaidInput.value)
    }
})

// 导出SVG
document.getElementById('exportSVG').addEventListener('click', async () => {
    const result = await dialog.showSaveDialog({
        filters: [
            { name: 'SVG Files', extensions: ['svg'] }
        ]
    })

    if (!result.canceled) {
        const svg = mermaidOutput.innerHTML
        fs.writeFileSync(result.filePath, svg)
    }
})

// 导出PNG
document.getElementById('exportPNG').addEventListener('click', async () => {
    const svg = mermaidOutput.querySelector('svg')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const svgData = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    
    img.onload = async () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)
        
        const result = await dialog.showSaveDialog({
            filters: [
                { name: 'PNG Files', extensions: ['png'] }
            ]
        })

        if (!result.canceled) {
            const buffer = canvas.toDataURL('image/png')
            const base64Data = buffer.replace(/^data:image\/png;base64,/, '')
            fs.writeFileSync(result.filePath, base64Data, 'base64')
        }
    }

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
})


// Mermaid 语法提示
const mermaidCompletions = {
    graph: {
        label: "graph",
        detail: "流程图",
        info: "创建一个流程图"
    },
    sequenceDiagram: {
        label: "sequenceDiagram",
        detail: "时序图",
        info: "创建一个时序图"
    },
    classDiagram: {
        label: "classDiagram",
        detail: "类图",
        info: "创建一个类图"
    },
    // 更多补全项...
}

// 自动补全配置
const mermaidLanguage = {
    autocomplete: context => {
        let word = context.matchBefore(/\w*/)
        if (!word) return null
        return {
            from: word.from,
            options: Object.values(mermaidCompletions)
        }
    }
}

// 创建编辑器
let editor = new EditorView({
    state: EditorState.create({
        doc: "",
        extensions: [
            basicSetup,
            javascript(),
            autocompletion(),
            mermaidLanguage,
            oneDark,
            EditorView.updateListener.of(update => {
                if (update.docChanged) {
                    renderMermaid(update.state.doc.toString())
                }
            })
        ]
    }),
    parent: document.getElementById("editor")
})

// 新建文件
document.getElementById('newFile').addEventListener('click', () => {
    editor.dispatch({
        changes: {
            from: 0,
            to: editor.state.doc.length,
            insert: ''
        }
    })
})

// 打开文件
document.getElementById('openFile').addEventListener('click', async () => {
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
    }
})

// 保存文件
document.getElementById('saveFile').addEventListener('click', async () => {
    const result = await dialog.showSaveDialog({
        filters: [
            { name: 'Mermaid Files', extensions: ['mmd'] }
        ]
    })

    if (!result.canceled) {
        fs.writeFileSync(result.filePath, editor.state.doc.toString())
    }
})

// 主题切换
const themeSelect = document.getElementById('themeSelect')
themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value
    mermaid.initialize({ 
        startOnLoad: true,
        theme: theme
    })
    document.body.className = `theme-${theme}`
    renderMermaid(editor.state.doc.toString())
})

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
            })
            .catch(error => {
                errorMessage.textContent = `错误: ${error.message}`
                errorMessage.classList.add('show')
            })
    } catch (error) {
        errorMessage.textContent = `错误: ${error.message}`
        errorMessage.classList.add('show')
    }
}