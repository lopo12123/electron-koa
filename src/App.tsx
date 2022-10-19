import { useCallback, useEffect, useState } from 'react'
import styles from 'styles/app.module.scss'
import { ipcRenderer } from "electron";
import toast, { Toaster } from "react-hot-toast";

const op_handler = (ev: any, pid: string, port: number) => {
  console.log(`a user interaction occurred on a client. (pid: ${ pid }, port: ${ port })`)
  toast(`a user interaction occurred on a client. (pid: ${ pid }, port: ${ port })`, { duration: 8000 })
}

const App = () => {
  const [ pidList, setPidList ] = useState<string[]>([])

  useEffect(() => {
    ipcRenderer.on('op', op_handler)
    return () => {
      ipcRenderer.off('op', op_handler)
    }
  }, [])

  const getPidList = useCallback(() => {
    ipcRenderer.invoke('server:stat',)
      .then(list => {
        setPidList(list)
        toast.success('[server:stat] Ok.')
      })
      .catch(err => {
        console.log(err)
        toast.error('[server:stat] Err.')
      })
  }, [])

  const setupServer = useCallback(() => {
    ipcRenderer.invoke('server:setup')
      .then(([ pid, port ]) => {
        toast.success(`[server:setup] Ok. (pid: ${ pid }, port: ${ port })`)
      })
      .catch(err => {
        console.log(err)
        toast.error('[server:setup] Err.')
      })
      .finally(getPidList)
  }, [])

  const disposeServer = useCallback((pid: string) => {
    ipcRenderer.invoke('server:dispose', pid)
      .then(res => {
        console.log(res)
        toast.success('[server:dispose] Ok.')
      })
      .catch(err => {
        console.log(err)
        toast.error('[server:dispose] Err.')
      })
      .finally(getPidList)
  }, [])

  const clearAll = useCallback(() => {
    ipcRenderer.invoke('server:clearAll')
      .then(_ => {
        toast.success('[server:clearAll] Ok')
      })
      .catch(err => {
        console.log(err)
        toast.error('[server:clearAll] Err')
      })
      .finally(getPidList)
  }, [])

  return (
    <div className={ styles.app }>
      <Toaster/>
      <p>note! do not press f5 to refresh the page, it might lead to memory leak.</p>
      <button onClick={ getPidList }>refresh pid list</button>
      <br/>
      <button onClick={ () => setupServer() }>setup a server</button>
      <br/>
      <button onClick={ () => clearAll() }>clear all</button>
      <br/>
      <p>pid list: ({ pidList.length })</p>
      <ul>
        {
          pidList.map(pid => (
            <li key={ pid }>
              { pid } &nbsp;
              <button onClick={ () => disposeServer(pid) }>dispose this instance</button>
            </li>
          ))
        }
      </ul>
    </div>
  )
}

export default App
