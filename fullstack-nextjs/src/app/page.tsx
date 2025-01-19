import UserList from './components/UserList';
import UserForm from './components/UserForm';
import SystemCheck from './components/SystemCheck';

export default function Page() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">クラウドネィティブ システム</h1>
      
      <SystemCheck />
      
      <div className="mb-12">
        <h2 className="text-xl font-semibold mb-4">新規ユーザー登録</h2>
        <UserForm />
      </div>
      
      <div>
        <h2 className="text-xl font-semibold mb-4">ユーザー一覧</h2>
        <UserList />
      </div>
    </div>
  );
}
