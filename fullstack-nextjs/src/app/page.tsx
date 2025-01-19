import SampleList from './components/SampleList';
import SampleForm from './components/SampleForm';
import SystemCheck from './components/SystemCheck';

export default function Page() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">クラウドネィティブ システム</h1>
      
      <SystemCheck />
      
      <div className="mb-12">
        <h2 className="text-xl font-semibold mb-4">新規サンプル登録</h2>
        <SampleForm />
      </div>
      
      <div>
        <h2 className="text-xl font-semibold mb-4">サンプル一覧</h2>
        <SampleList />
      </div>
    </div>
  );
}
