import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// ★ 真っ白(白画面)対策: 描画時エラーを画面に表示して原因を特定できるようにする
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { this.setState({ info }); console.error('[App crashed]', error, info); }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      const msg = (e && (e.stack || e.message)) || String(e);
      const comp = this.state.info?.componentStack || '';
      return (
        <div style={{padding:20,fontFamily:'system-ui',color:'#0f172a',background:'#fff',minHeight:'100vh',boxSizing:'border-box'}}>
          <div style={{fontWeight:'bold',fontSize:18,color:'#dc2626',marginBottom:8}}>⚠️ 画面の表示中にエラーが発生しました</div>
          <div style={{fontSize:13,color:'#475569',marginBottom:12}}>下の内容をスクリーンショットで送ってください。原因を特定して修正します。</div>
          <button onClick={()=>{ try{ localStorage.clear(); sessionStorage.clear(); }catch(_e){} location.reload(); }}
            style={{marginBottom:12,padding:'8px 14px',background:'#2563eb',color:'#fff',border:'none',borderRadius:8,fontWeight:'bold',cursor:'pointer'}}>
            データをクリアして再読み込み
          </button>
          <pre style={{whiteSpace:'pre-wrap',fontSize:11,background:'#f1f5f9',border:'1px solid #cbd5e1',borderRadius:8,padding:12,overflow:'auto',maxHeight:'40vh'}}>{msg}</pre>
          {comp && <pre style={{whiteSpace:'pre-wrap',fontSize:11,background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:12,overflow:'auto',maxHeight:'30vh',marginTop:8}}>{comp}</pre>}
        </div>
      );
    }
    return this.props.children;
  }
}

// ★ 2026-10-07(店舗報告「スマホで連続して操作した後、しばらくするとタップの反応する位置がずれる」):
//   iPhone は文字入力のキーボードを出すと画面全体(本来は動かない外枠)を上へずらし、キーボードを閉じても戻らないことがある。
//   すると見た目と押した位置が食い違う。外枠がスクロールしない作り(内側の枠だけがスクロール)のときに限り、
//   キーボードが閉じた後・入力欄から離れた後に外枠のずれを0に戻す。拡大表示中(ピンチ)や入力中は触らない。
if (typeof window !== 'undefined') {
  let _vvT = null;
  const _resetShift = () => {
    clearTimeout(_vvT);
    _vvT = setTimeout(() => {
      try {
        const ae = document.activeElement;
        if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
        const vv = window.visualViewport;
        if (vv && vv.scale > 1.01) return;
        const se = document.scrollingElement || document.documentElement;
        if ((window.scrollY || 0) !== 0 && se.scrollHeight <= window.innerHeight + 2) window.scrollTo(0, 0);
      } catch (_e) { /* noop */ }
    }, 250);
  };
  try { window.visualViewport && window.visualViewport.addEventListener('resize', _resetShift); } catch (_e) { /* noop */ }
  document.addEventListener('focusout', _resetShift);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
