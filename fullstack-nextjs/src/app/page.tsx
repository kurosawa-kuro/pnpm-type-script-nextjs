import UserList from './components/UserList';
import UserForm from './components/UserForm';
import Link from 'next/link';

export default function Page() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">ユーザー管理システム</h1>
      
      <div className="mb-4">
        <Link href="/health" className="text-blue-600 hover:text-blue-800 underline">
          システム状態確認
        </Link>
      </div>
      
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
