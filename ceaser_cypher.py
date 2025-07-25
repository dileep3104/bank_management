def encryption(n,shift):
    new_str=""
    for i in n:
        if i.islower():
            val=(ord(i)-ord('a')+shift)%26
            new_str+=chr(ord('a')+val)
        elif i.isupper():
            val=(ord(i)-ord('A')+shift)%26
            new_str+=chr(ord('A')+val)
    return new_str        

def decryption(n,shift):
    dec=""
    for i in n:
        if i.islower():
            val=(ord(i)-ord('a')-shift)%26
            dec+=chr(ord('a')+val)
        elif i.isupper():
            val=(ord(i)-ord('A')-shift)%26
            dec+=chr(ord('A')+val)
    return dec        





n=input("enter the string: ")
shift=int(input("Ehter the shift value: "))
encry=(encryption(n,shift))
deccr=decryption(encry,shift)
print("encrypted value : "+encry)
print("Decrtpted value : " +deccr)