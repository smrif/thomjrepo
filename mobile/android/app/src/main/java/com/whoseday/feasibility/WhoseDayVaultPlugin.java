package com.whoseday.feasibility;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.app.Activity;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.util.HashSet;
import org.json.JSONObject;
import org.json.JSONArray;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.graphics.Paint;
import android.graphics.pdf.PdfDocument;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name="WhoseDayVault")
public class WhoseDayVaultPlugin extends Plugin {
    private final Object mutex = new Object();
    private static final String ALIAS="whose-day-lab-session";
    private static class Database extends SQLiteOpenHelper {
        Database(Context context){super(context,"whose-day-lab.sqlite",null,1);}
        @Override public void onConfigure(SQLiteDatabase db){db.execSQL("PRAGMA synchronous=FULL");}
        @Override public void onCreate(SQLiteDatabase db){db.execSQL("CREATE TABLE records (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)");}
        @Override public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion){throw new IllegalStateException("Unsupported lab schema upgrade");}
    }
    @PluginMethod public void testMode(PluginCall call){
        JSObject result=new JSObject();
        boolean debug=(getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0;
        String mode=debug?getActivity().getIntent().getStringExtra("labProbe"):"";
        result.put("mode",mode==null?"":mode);call.resolve(result);
    }
    private String key(PluginCall call) throws Exception {
        String key=call.getString("key");
        if(key==null || !key.matches("[A-Za-z0-9:._-]{1,200}"))throw new Exception("Invalid key");
        return key;
    }
    @PluginMethod public void write(PluginCall call){synchronized(mutex){
        try(Database helper=new Database(getContext())){
            String key=key(call),value=call.getString("value");
            if(value==null || value.getBytes(StandardCharsets.UTF_8).length>6*1024*1024)throw new Exception("Invalid value");
            SQLiteDatabase db=helper.getWritableDatabase();db.beginTransaction();
            try{ContentValues values=new ContentValues();values.put("key",key);values.put("value",value);if(db.insertWithOnConflict("records",null,values,SQLiteDatabase.CONFLICT_REPLACE)==-1)throw new Exception("Insert failed");db.setTransactionSuccessful();}finally{db.endTransaction();}
            call.resolve();
        }catch(Exception error){call.reject("Native record write failed.");}
    }}
    @PluginMethod public void read(PluginCall call){synchronized(mutex){
        try(Database helper=new Database(getContext());Cursor cursor=helper.getReadableDatabase().rawQuery("SELECT value FROM records WHERE key=?",new String[]{key(call)})){
            JSObject result=new JSObject();result.put("value",cursor.moveToFirst()?cursor.getString(0):org.json.JSONObject.NULL);call.resolve(result);
        }catch(Exception error){call.reject("Native record read failed.");}
    }}
    @PluginMethod public void keys(PluginCall call){synchronized(mutex){
        String prefix=call.getString("prefix");
        if(prefix==null || !prefix.matches("[A-Za-z0-9:._-]{1,160}")){call.reject("Invalid record prefix.");return;}
        try(Database helper=new Database(getContext());Cursor cursor=helper.getReadableDatabase().rawQuery("SELECT key FROM records WHERE substr(key,1,?)=? ORDER BY key LIMIT 20001",new String[]{String.valueOf(prefix.length()),prefix})){
            org.json.JSONArray keys=new org.json.JSONArray();while(cursor.moveToNext())keys.put(cursor.getString(0));
            JSObject result=new JSObject();result.put("keys",keys);call.resolve(result);
        }catch(Exception error){call.reject("Native record listing failed.");}
    }}
    @PluginMethod public void compareBatch(PluginCall call){synchronized(mutex){
        try(Database helper=new Database(getContext())){
            JSArray rows=call.getArray("rows");if(rows==null||rows.length()==0||rows.length()>20002)throw new Exception("Invalid transaction");
            HashSet<String> seen=new HashSet<>();long total=0;
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i);String key=row.getString("key");Object expected=row.get("expected");
                if(!key.matches("[A-Za-z0-9:._-]{1,200}")||!seen.add(key)||!(expected==JSONObject.NULL||expected instanceof String))throw new Exception("Invalid row");
                if(expected instanceof String)total+=((String)expected).getBytes(StandardCharsets.UTF_8).length;
                if(row.has("value")){Object value=row.get("value");if(!(value instanceof String))throw new Exception("Invalid value");int size=((String)value).getBytes(StandardCharsets.UTF_8).length;if(size>6*1024*1024)throw new Exception("Invalid value");total+=size;}
            }
            if(total>64*1024*1024)throw new Exception("Invalid size");
            SQLiteDatabase db=helper.getWritableDatabase();db.beginTransaction();boolean matched=true;
            try{
                for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);String expected=row.isNull("expected")?null:row.getString("expected");
                    try(Cursor cursor=db.rawQuery("SELECT value FROM records WHERE key=?",new String[]{row.getString("key")})){
                        String actual=cursor.moveToFirst()?cursor.getString(0):null;if(!java.util.Objects.equals(expected,actual)){matched=false;break;}
                    }
                }
                if(matched){for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);if(!row.has("value"))continue;ContentValues values=new ContentValues();values.put("key",row.getString("key"));values.put("value",row.getString("value"));if(db.insertWithOnConflict("records",null,values,SQLiteDatabase.CONFLICT_REPLACE)==-1)throw new Exception("Insert failed");}db.setTransactionSuccessful();}
            }finally{db.endTransaction();}
            JSObject result=new JSObject();result.put("matched",matched);call.resolve(result);
        }catch(Exception error){call.reject("Native restore transaction failed. Reopen to check saved records.");}
    }}
    private boolean filePickerBusy=false;
    @PluginMethod public void exportBackup(PluginCall call){
        if(filePickerBusy){call.reject("Close the current file picker first.");return;}
        String text=call.getString("text"),name=call.getString("name");
        if(text==null||text.getBytes(StandardCharsets.UTF_8).length>25*1024*1024||name==null||!name.matches("whose-day-backup-[0-9-]+\\.json")){call.reject("Invalid backup file.");return;}
        filePickerBusy=true;
        try{Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/json");intent.putExtra(Intent.EXTRA_TITLE,name);startActivityForResult(call,intent,"backupExported");}
        catch(Exception error){filePickerBusy=false;call.reject("Could not open the file picker.");}
    }
    @ActivityCallback private void backupExported(PluginCall call,ActivityResult activity){
        filePickerBusy=false;if(call==null)return;
        if(activity.getResultCode()!=Activity.RESULT_OK){JSObject result=new JSObject();result.put("cancelled",true);call.resolve(result);return;}
        try{
            if(activity.getData()==null||activity.getData().getData()==null||!"content".equals(activity.getData().getData().getScheme()))throw new Exception("Missing document provider");
            byte[] bytes=call.getString("text").getBytes(StandardCharsets.UTF_8);
            try(OutputStream stream=getContext().getContentResolver().openOutputStream(activity.getData().getData(),"wt")){if(stream==null)throw new Exception("No stream");stream.write(bytes);stream.flush();}
            JSObject result=new JSObject();result.put("saved",true);call.resolve(result);
        }catch(Exception error){call.reject("Could not save the backup. A partial file may remain; choose a new destination and retry.");}
    }
    @PluginMethod public void importBackup(PluginCall call){
        if(filePickerBusy){call.reject("Close the current file picker first.");return;}filePickerBusy=true;
        try{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/json");startActivityForResult(call,intent,"backupImported");}
        catch(Exception error){filePickerBusy=false;call.reject("Could not open the file picker.");}
    }
    @ActivityCallback private void backupImported(PluginCall call,ActivityResult activity){
        filePickerBusy=false;if(call==null)return;
        if(activity.getResultCode()!=Activity.RESULT_OK){JSObject result=new JSObject();result.put("cancelled",true);call.resolve(result);return;}
        try{
            if(activity.getData()==null||activity.getData().getData()==null||!"content".equals(activity.getData().getData().getScheme()))throw new Exception("Missing document provider");
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();
            try(InputStream stream=getContext().getContentResolver().openInputStream(activity.getData().getData())){
                if(stream==null)throw new Exception("No stream");byte[] chunk=new byte[65536];int size;
                while((size=stream.read(chunk))!=-1){if(bytes.size()+size>25*1024*1024)throw new Exception("Too large");bytes.write(chunk,0,size);}
            }
            String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
            JSObject result=new JSObject();result.put("text",text);result.put("name","Selected backup.json");call.resolve(result);
        }catch(Exception error){call.reject("Could not read this backup. Choose a UTF-8 JSON file up to 25 MB.");}
    }
    private SecretKey secretKey() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return (SecretKey)store.getKey(ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    @PluginMethod public void writeSecret(PluginCall call){synchronized(mutex){try{
        String key=key(call),value=call.getString("value");if(value==null || value.getBytes(StandardCharsets.UTF_8).length>65536)throw new Exception("Invalid secret");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,secretKey());
        String encoded=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
        if(!getContext().getSharedPreferences("lab-secrets",Context.MODE_PRIVATE).edit().putString(key,encoded).commit())throw new Exception("Commit failed");call.resolve();
    }catch(Exception error){call.reject("Secure session write failed.");}}}
    @PluginMethod public void readSecret(PluginCall call){synchronized(mutex){try{
        String value=getContext().getSharedPreferences("lab-secrets",Context.MODE_PRIVATE).getString(key(call),null);JSObject result=new JSObject();
        if(value==null){result.put("value",org.json.JSONObject.NULL);call.resolve(result);return;}
        String[] parts=value.split(":",-1);if(parts.length!=2)throw new Exception("Invalid secret");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,secretKey(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
        result.put("value",new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8));call.resolve(result);
    }catch(Exception error){call.reject("Secure session read failed.");}}}
    @PluginMethod public void removeSecret(PluginCall call){synchronized(mutex){try{
        if(!getContext().getSharedPreferences("lab-secrets",Context.MODE_PRIVATE).edit().remove(key(call)).commit())throw new Exception("Commit failed");call.resolve();
    }catch(Exception error){call.reject("Secure session removal failed.");}}}
    @PluginMethod public void makeReport(PluginCall call){try{
        String text=call.getString("text");if(text==null || text.isEmpty() || text.length()>12000)throw new Exception("Invalid report");
        File directory=new File(getContext().getCacheDir(),"lab-reports");if(!directory.exists()&&!directory.mkdirs())throw new Exception("Could not create report folder");
        File[] oldFiles=directory.listFiles();if(oldFiles!=null)for(File file:oldFiles)if(!file.delete())throw new Exception("Could not clear temporary reports");
        File file=new File(directory,"Whose-Day-test-"+UUID.randomUUID()+".pdf");
        PdfDocument document=new PdfDocument();
        try{
            Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setTextSize(13);int number=1,y=50;
            PdfDocument.Page page=document.startPage(new PdfDocument.PageInfo.Builder(595,842,number).create());
            for(String paragraph:text.split("\n",-1)){
                String rest=paragraph;
                do{
                    if(y>790){document.finishPage(page);page=document.startPage(new PdfDocument.PageInfo.Builder(595,842,++number).create());y=50;}
                    int count=rest.isEmpty()?0:paint.breakText(rest,true,515,null);if(!rest.isEmpty()&&count==0)throw new Exception("Cannot lay out report");
                    page.getCanvas().drawText(rest.substring(0,count),40,y,paint);y+=19;rest=rest.substring(count);
                }while(!rest.isEmpty());
            }
            document.finishPage(page);try(FileOutputStream stream=new FileOutputStream(file)){document.writeTo(stream);}
        }finally{document.close();}
        JSObject result=new JSObject();result.put("uri",android.net.Uri.fromFile(file).toString());call.resolve(result);
    }catch(Exception error){call.reject("Could not create the test PDF.");}}
}
