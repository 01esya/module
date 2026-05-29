import React, { useState } from "react";
import { Employee } from "../types";
import { User, Phone, Shield, Trash2, Plus, UserPlus, FileText, CheckCircle } from "lucide-react";

interface PersonnelGridProps {
  employees: Employee[];
  onCreate: (name: string, role: string, phone: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export default function PersonnelGrid({
  employees,
  onCreate,
  onDelete
}: PersonnelGridProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    if (!name.trim() || !role.trim() || !phone.trim()) {
      setErrorText("Заполните полностью все реквизиты сотрудника");
      return;
    }

    // Phone parsing logic similar to python schema RU regex:
    // Numbers 8XXXXXXXXXX should resolve to +7XXXXXXXXXX
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setErrorText("Номер телефона должен содержать минимум 10 цифр");
      return;
    }

    setLoading(true);
    const success = await onCreate(name, role, phone);
    setLoading(false);

    if (success) {
      setName("");
      setRole("");
      setPhone("");
      setShowAddForm(false);
    } else {
      setErrorText("Локальная ошибка валидации номера телефона в РФ (+7)");
    }
  };

  return (
    <div id="company_personnel_management" className="space-y-6">
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Штат служащих логистики</h2>
          <p className="text-xs text-slate-400 mt-0.5">Картотека водителей-экспедиторов и диспетчеров системы</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-amber-500/5 select-none"
        >
          {showAddForm ? "Скрыть форму" : "Добавить штатного"}
          <UserPlus className="w-4 h-4" />
        </button>
      </div>

      {/* Show collapsible employee addition card */}
      {showAddForm && (
        <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 max-w-lg transition-all animate-[fadeIn_0.2s_ease-out]">
          <h3 className="text-sm font-semibold text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-2">
            <Plus className="w-4 h-4 text-amber-500" />
            Регистрация нового штатного лица
          </h3>

          {errorText && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg p-2.5 text-xs">
              ⚠️ {errorText}
            </div>
          )}

          <div className="space-y-3 text-xs text-slate-300">
            <div>
              <label className="text-slate-400 block mb-1">ФИО сотрудника полностью</label>
              <input
                required
                type="text"
                placeholder="Иванченко Григорий Васильевич"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 px-3 py-2 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Служебный ранг / Должность</label>
                <input
                  required
                  type="text"
                  placeholder="Водитель КАМАЗа"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 px-3 py-2 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Мобильный телефон (RU)</label>
                <input
                  required
                  type="text"
                  placeholder="+7 (999) 888-77-66"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 px-3 py-2 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 transition-all"
            >
              Отменить
            </button>
            <button
              type="submit"
              disabled={loading}
              className="text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-600 px-4 py-1.5 rounded-lg disabled:bg-slate-800 transition-all cursor-pointer"
            >
              {loading ? "Добавление..." : "Записать в базу"}
            </button>
          </div>
        </form>
      )}

      {/* Directory cards list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {employees.map((emp) => (
          <div key={emp.id} className="bg-slate-900 border border-slate-850 p-4 rounded-2xl flex flex-col justify-between hover:border-slate-800 transition-all">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-400 flex-shrink-0">
                <User className="w-5 h-5 text-amber-500" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-slate-100 tracking-tight text-ellipsis overflow-hidden truncate">
                  {emp.name}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span className="truncate">{emp.role}</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1 font-mono">
                  <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span>{emp.phone}</span>
                </p>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 mt-4 flex justify-between items-center text-[10px] text-slate-500">
              <span className="font-mono">ID: {emp.id}</span>
              <button
                onClick={() => onDelete(emp.id)}
                className="text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 p-1.5 rounded-lg transition-all cursor-pointer"
                title="Удалить из компании"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
