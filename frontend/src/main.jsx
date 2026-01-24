import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Error Boundary Component
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('React Error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ 
                    padding: '20px', 
                    fontFamily: 'system-ui, sans-serif',
                    maxWidth: '800px',
                    margin: '50px auto'
                }}>
                    <h1 style={{ color: '#dc2626' }}>⚠️ เกิดข้อผิดพลาด</h1>
                    <p>กรุณารีเฟรชหน้าเว็บ หรือติดต่อผู้ดูแลระบบ</p>
                    <details style={{ 
                        marginTop: '20px', 
                        padding: '10px', 
                        background: '#f3f4f6', 
                        borderRadius: '8px' 
                    }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                            รายละเอียด Error (สำหรับนักพัฒนา)
                        </summary>
                        <pre style={{ 
                            marginTop: '10px', 
                            overflow: 'auto', 
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap'
                        }}>
                            {this.state.error && this.state.error.toString()}
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                        </pre>
                    </details>
                    <button 
                        onClick={() => window.location.reload()} 
                        style={{
                            marginTop: '20px',
                            padding: '10px 20px',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer'
                        }}
                    >
                        รีเฟรชหน้าเว็บ
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
);
