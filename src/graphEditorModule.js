const { EditorState } = require('@codemirror/state')
const { EditorView } = require('@codemirror/view')
const { markdown } = require('@codemirror/lang-markdown')

const GraphEditorModule = (() => {
    let previewEditor = null
    let nodesDataSet = null
    let edgesDataSet = null
    let network = null
    let graphHeader = 'graph TD'
    let currentMermaid = 'graph TD'
    let onMermaidChange = null
    let isInitialized = false
    let isLoading = false
    let nextNodeIndex = 1
    let renderCounter = 0
    let visAvailable = true

    function init(options = {}) {
        if (isInitialized) {
            if (options.onMermaidChange) {
                onMermaidChange = options.onMermaidChange
            }
            return
        }

        onMermaidChange = options.onMermaidChange || null

        const previewHost = document.getElementById('graphModePreview')
        if (!previewHost) {
            console.warn('GraphEditorModule: 未找到预览容器。')
            return
        }

        previewEditor = new EditorView({
            state: EditorState.create({
                doc: currentMermaid,
                extensions: [
                    markdown(),
                    EditorView.editable.of(false),
                    EditorView.lineWrapping,
                    EditorView.theme({
                        '&': {
                            height: '100%',
                            backgroundColor: 'transparent'
                        },
                        '.cm-content': {
                            fontFamily: 'monospace'
                        },
                        '.cm-scroller': {
                            overflow: 'auto'
                        }
                    })
                ]
            }),
            parent: previewHost
        })

        if (typeof vis === 'undefined' || !vis.DataSet) {
            visAvailable = false
            const canvas = document.getElementById('graphCanvas')
            if (canvas) {
                canvas.innerHTML = '<div class="graph-error">未能加载 vis-network 组件，请检查网络连接。</div>'
            }
            console.error('GraphEditorModule: vis-network 未加载，图形编辑器不可用。')
            isInitialized = true
            return
        }

        nodesDataSet = new vis.DataSet([])
        edgesDataSet = new vis.DataSet([])

        const canvas = document.getElementById('graphCanvas')
        network = new vis.Network(canvas, { nodes: nodesDataSet, edges: edgesDataSet }, buildNetworkOptions())

        attachDatasetListeners()
        bindToolbar()
        bindNetworkEvents()

        isInitialized = true
        updateMermaid()
    }

    function requestNodeLabel(message, defaultValue) {
        if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
            return Promise.resolve(window.prompt(message, defaultValue))
        }

        return new Promise(resolve => {
            const existingOverlay = document.querySelector('.graph-modal-overlay')
            if (existingOverlay) {
                existingOverlay.remove()
            }

            const overlay = document.createElement('div')
            overlay.className = 'graph-modal-overlay'

            const modal = document.createElement('div')
            modal.className = 'graph-modal'

            const title = document.createElement('div')
            title.className = 'graph-modal-title'
            title.textContent = message

            const input = document.createElement('input')
            input.type = 'text'
            input.className = 'graph-modal-input'
            input.value = defaultValue || ''

            const buttons = document.createElement('div')
            buttons.className = 'graph-modal-buttons'

            const cancelButton = document.createElement('button')
            cancelButton.className = 'graph-modal-button'
            cancelButton.textContent = '取消'

            const confirmButton = document.createElement('button')
            confirmButton.className = 'graph-modal-button primary'
            confirmButton.textContent = '确定'

            function close(value) {
                overlay.remove()
                resolve(value)
            }

            cancelButton.addEventListener('click', () => close(null))
            confirmButton.addEventListener('click', () => close(input.value))

            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault()
                    confirmButton.click()
                } else if (event.key === 'Escape') {
                    event.preventDefault()
                    close(null)
                }
            })

            overlay.addEventListener('click', event => {
                if (event.target === overlay) {
                    close(null)
                }
            })

            buttons.appendChild(cancelButton)
            buttons.appendChild(confirmButton)

            modal.appendChild(title)
            modal.appendChild(input)
            modal.appendChild(buttons)

            overlay.appendChild(modal)
            document.body.appendChild(overlay)

            requestAnimationFrame(() => {
                input.focus()
                input.select()
            })
        })
    }

    function buildNetworkOptions() {
        return {
            autoResize: true,
            interaction: {
                hover: true,
                multiselect: true
            },
            manipulation: {
                enabled: true,
                addNode: function (nodeData, callback) {
                    requestNodeLabel('输入节点名称', `节点${nextNodeIndex}`)
                        .then(label => {
                            if (label === null) {
                                callback(null)
                                return
                            }
                            const trimmed = label.trim()
                            if (!trimmed) {
                                callback(null)
                                return
                            }
                            nodeData.id = generateNodeId()
                            nodeData.label = trimmed
                            callback(nodeData)
                        })
                },
                editNode: function (nodeData, callback) {
                    requestNodeLabel('编辑节点名称', nodeData.label)
                        .then(label => {
                            if (label === null) {
                                callback(null)
                                return
                            }
                            const trimmed = label.trim()
                            if (!trimmed) {
                                callback(null)
                                return
                            }
                            nodeData.label = trimmed
                            callback(nodeData)
                        })
                },
                addEdge: function (edgeData, callback) {
                    if (!edgeData.from || !edgeData.to) {
                        callback(null)
                        return
                    }
                    if (edgeData.from === edgeData.to) {
                        const acceptSelf = confirm('要创建自连接吗？')
                        if (!acceptSelf) {
                            callback(null)
                            return
                        }
                    }
                    callback(edgeData)
                }
            },
            physics: {
                stabilization: false
            },
            nodes: {
                shape: 'box',
                borderWidth: 2,
                color: {
                    background: '#ffffff',
                    border: '#1a73e8',
                    highlight: {
                        background: '#fff8e1',
                        border: '#fb8c00'
                    }
                },
                font: {
                    color: '#333333',
                    size: 16,
                    face: '"Noto Sans", "Microsoft YaHei", sans-serif'
                }
            },
            edges: {
                arrows: {
                    to: {
                        enabled: true,
                        scaleFactor: 0.8
                    }
                },
                smooth: {
                    type: 'cubicBezier'
                },
                color: {
                    color: '#4a90e2',
                    highlight: '#fb8c00'
                }
            }
        }
    }

    function bindToolbar() {
        const clearButton = document.getElementById('graphModeClear')
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                if (!visAvailable) return
                const confirmed = confirm('确定要清空所有节点和连线吗？')
                if (confirmed) {
                    nodesDataSet.clear()
                    edgesDataSet.clear()
                }
            })
        }

        const centerButton = document.getElementById('graphModeCenter')
        if (centerButton) {
            centerButton.addEventListener('click', () => {
                if (!visAvailable || !network) return
                network.fit({ animation: { duration: 400 } })
            })
        }
    }

    function bindNetworkEvents() {
        if (!network) return
        network.on('doubleClick', params => {
            if (!params || !params.nodes || params.nodes.length !== 1) return
            const nodeId = params.nodes[0]
            handleEditNode(nodeId)
        })
    }

    function handleEditNode(nodeId) {
        if (!nodesDataSet) return
        const node = nodesDataSet.get(nodeId)
        if (!node) return
        const label = prompt('编辑节点名称', node.label || node.id)
        if (label === null) return
        const trimmed = label.trim()
        if (!trimmed) return
        nodesDataSet.update({ id: nodeId, label: trimmed })
    }

    function attachDatasetListeners() {
        if (!nodesDataSet || !edgesDataSet) return
        const update = () => updateMermaid()
        nodesDataSet.on('add', update)
        nodesDataSet.on('update', update)
        nodesDataSet.on('remove', update)
        edgesDataSet.on('add', update)
        edgesDataSet.on('update', update)
        edgesDataSet.on('remove', update)
    }

    function generateNodeId() {
        let id
        do {
            id = `node_${nextNodeIndex++}`
        } while (nodesDataSet && nodesDataSet.get(id))
        return id
    }

    function openEditor(initialSource) {
        init()
        if (!visAvailable) {
            currentMermaid = initialSource || currentMermaid
            if (previewEditor) {
                const update = previewEditor.state.update({
                    changes: {
                        from: 0,
                        to: previewEditor.state.doc.length,
                        insert: currentMermaid
                    }
                })
                previewEditor.dispatch(update)
            }
            renderPreviewDiagram(currentMermaid)
            return
        }
        loadFromMermaid(initialSource)
    }

    function closeEditor() {
        if (!visAvailable) return
        currentMermaid = buildMermaidString()
    }

    function loadFromMermaid(source) {
        if (!nodesDataSet || !edgesDataSet) {
            currentMermaid = source || currentMermaid
            if (previewEditor) {
                const update = previewEditor.state.update({
                    changes: {
                        from: 0,
                        to: previewEditor.state.doc.length,
                        insert: currentMermaid
                    }
                })
                previewEditor.dispatch(update)
            }
            renderPreviewDiagram(currentMermaid)
            return
        }
        isLoading = true
        nodesDataSet.clear()
        edgesDataSet.clear()

        const parsed = parseMermaidSource(source)
        graphHeader = parsed.header || 'graph TD'
        nextNodeIndex = parsed.nextIndex

        if (parsed.nodes.length > 0) {
            nodesDataSet.add(parsed.nodes)
        }
        if (parsed.edges.length > 0) {
            edgesDataSet.add(parsed.edges)
        }

        isLoading = false
        updateMermaid()
        if (network) {
            if (parsed.nodes.length > 0) {
                network.fit({ animation: { duration: 400 } })
            }
        }
    }

    function parseMermaidSource(source) {
        const nodesMap = new Map()
        const edges = []
        const lines = (source || '').split('\n')
        let header = 'graph TD'
        let edgeCount = 0

        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('%%')) continue
            if (trimmed.startsWith('graph ')) {
                header = trimmed
                continue
            }

            const edgeMatch = trimmed.match(/^([A-Za-z0-9_]+)(?:\[(.*?)\])?\s*--\>\s*([A-Za-z0-9_]+)(?:\[(.*?)\])?/)
            if (edgeMatch) {
                const [, fromId, fromLabel, toId, toLabel] = edgeMatch
                const safeFromId = sanitizeId(fromId)
                const safeToId = sanitizeId(toId)
                if (!nodesMap.has(safeFromId)) {
                    nodesMap.set(safeFromId, {
                        id: safeFromId,
                        label: fromLabel ? fromLabel.trim() : safeFromId
                    })
                }
                if (!nodesMap.has(safeToId)) {
                    nodesMap.set(safeToId, {
                        id: safeToId,
                        label: toLabel ? toLabel.trim() : safeToId
                    })
                }
                edges.push({ id: `edge_${edgeCount++}`, from: safeFromId, to: safeToId })
                continue
            }

            const nodeMatch = trimmed.match(/^([A-Za-z0-9_]+)\[(.+)\]$/)
            if (nodeMatch) {
                const [, id, label] = nodeMatch
                const safeId = sanitizeId(id)
                if (!nodesMap.has(safeId)) {
                    nodesMap.set(safeId, { id: safeId, label: label.trim() })
                }
            }
        }

        const nodes = Array.from(nodesMap.values())
        let highestIndex = 0
        for (const node of nodes) {
            const match = node.id.match(/_(\d+)$/)
            if (match) {
                const value = parseInt(match[1], 10)
                if (!Number.isNaN(value) && value > highestIndex) {
                    highestIndex = value
                }
            }
        }

        return {
            header,
            nodes,
            edges,
            nextIndex: Math.max(highestIndex + 1, nodes.length + 1)
        }
    }

    function sanitizeId(id) {
        const trimmed = String(id || '').trim()
        if (!trimmed) return 'node'
        return trimmed.replace(/\s+/g, '_')
    }

    function buildMermaidString() {
        const lines = [graphHeader || 'graph TD']
        if (nodesDataSet) {
            const nodes = nodesDataSet.get().sort((a, b) => String(a.id).localeCompare(String(b.id)))
            for (const node of nodes) {
                lines.push(`    ${sanitizeId(node.id)}[${escapeLabel(node.label || node.id)}]`)
            }
        }
        if (edgesDataSet) {
            const edges = edgesDataSet.get()
            for (const edge of edges) {
                const from = sanitizeId(edge.from)
                const to = sanitizeId(edge.to)
                if (!from || !to) continue
                lines.push(`    ${from} --> ${to}`)
            }
        }
        return lines.join('\n')
    }

    function escapeLabel(label) {
        return String(label || '')
            .replace(/\]/g, '\\]')
            .replace(/\[/g, '\\[')
    }

    function updateMermaid() {
        if (isLoading) return
        currentMermaid = buildMermaidString()
        if (previewEditor) {
            const update = previewEditor.state.update({
                changes: {
                    from: 0,
                    to: previewEditor.state.doc.length,
                    insert: currentMermaid
                }
            })
            previewEditor.dispatch(update)
        }
        renderPreviewDiagram(currentMermaid)
        if (typeof onMermaidChange === 'function') {
            onMermaidChange(currentMermaid)
        }
    }

    function renderPreviewDiagram(source) {
        const diagramContainer = document.getElementById('graphPreviewDiagram')
        const errorContainer = document.getElementById('graphPreviewError')
        if (!diagramContainer || !errorContainer) return

        diagramContainer.innerHTML = ''
        errorContainer.classList.remove('show')
        errorContainer.textContent = ''

        try {
            const renderId = `graph-preview-${++renderCounter}`
            mermaid.render(renderId, source)
                .then(result => {
                    diagramContainer.innerHTML = result.svg
                })
                .catch(error => {
                    errorContainer.textContent = `错误: ${error.message}`
                    errorContainer.classList.add('show')
                })
        } catch (error) {
            errorContainer.textContent = `错误: ${error.message}`
            errorContainer.classList.add('show')
        }
    }

    function setMermaidChangeHandler(handler) {
        onMermaidChange = handler
    }

    function getCurrentMermaid() {
        return currentMermaid
    }

    return {
        init,
        open: openEditor,
        close: closeEditor,
        loadFromMermaid,
        getCurrentMermaid,
        setMermaidChangeHandler
    }
})()

module.exports = GraphEditorModule
